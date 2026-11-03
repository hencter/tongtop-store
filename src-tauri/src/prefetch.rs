//! 更新队列的后台预取策略（纯函数，不碰网络）。
//!
//! winget 同一时刻只能跑一个 install/upgrade，但安装包下载是普通 HTTP，
//! 可以和当前项的「安装阶段」重叠：当前项在装的时候，把后面 1–2 个包先下到
//! `%TEMP%\WinGet\<Id>.<Version>\<SHA256>`，下一项的 `winget upgrade` 发现哈希
//! 一致就会跳过下载。
//!
//! 带宽约束：当前项自己的预取（有进度条）优先；后台预取只在 hold 解除后启动。
//! 磁盘约束：队列里最多再挂 LOOKAHEAD 个（含正在下的），避免一次囤几十个安装包。

use std::collections::VecDeque;

/// 当前安装项之外，最多再预取这么多个安装包（含正在下的）。
pub const LOOKAHEAD: usize = 2;

/// 从任务 id（`winget:upgrade:7zip.7zip`）取出 winget 包 id。
pub fn winget_id_of_task(task_id: &str) -> Option<&str> {
    let mut it = task_id.splitn(3, ':');
    let kind = it.next()?;
    let action = it.next()?;
    let id = it.next()?;
    if !kind.eq_ignore_ascii_case("winget") {
        return None;
    }
    if !matches!(action, "install" | "upgrade" | "elevated") {
        return None;
    }
    if id.is_empty() {
        None
    } else {
        Some(id)
    }
}

/// 把即将轮到的包 id 写入预取队列。已在队列里或正在下的跳过；超过 cap 的丢掉。
/// `inflight` 是后台正在下的 id（去重用）。它占 LOOKAHEAD 名额，除非就是 `current`
/// （当前正在安装的那一项自己的下载不算「提前预取」）。
pub fn enqueue(
    queue: &mut VecDeque<String>,
    ids: impl IntoIterator<Item = String>,
    inflight: Option<&str>,
    current: Option<&str>,
    cap: usize,
) {
    let inflight_l = inflight.map(|s| s.to_lowercase());
    let current_l = current.map(|s| s.to_lowercase());
    let inflight_counts = inflight_l
        .as_deref()
        .is_some_and(|i| current_l.as_deref().map_or(true, |c| c != i));
    for id in ids {
        let id = id.trim();
        if id.is_empty() {
            continue;
        }
        if inflight_l
            .as_deref()
            .is_some_and(|s| s.eq_ignore_ascii_case(id))
        {
            continue;
        }
        if current_l
            .as_deref()
            .is_some_and(|s| s.eq_ignore_ascii_case(id))
        {
            continue;
        }
        if queue.iter().any(|q| q.eq_ignore_ascii_case(id)) {
            continue;
        }
        let used = queue.len() + usize::from(inflight_counts);
        if used >= cap {
            break;
        }
        queue.push_back(id.to_string());
    }
}

/// 取出下一个该预取的 id。`skip` 是当前正在安装的包（它自己的任务会预取，后台不要抢）。
/// 被 skip 掉的项直接丢弃，不再塞回队列。
pub fn take_next(queue: &mut VecDeque<String>, skip: Option<&str>) -> Option<String> {
    let skip_l = skip.map(|s| s.to_lowercase());
    while let Some(id) = queue.pop_front() {
        if skip_l
            .as_deref()
            .is_some_and(|s| s.eq_ignore_ascii_case(&id))
        {
            continue;
        }
        return Some(id);
    }
    None
}

/// 从队列里拿掉某个包（任务被取消 / 已经开始安装）。正在下的由调用方另发取消标志。
pub fn remove(queue: &mut VecDeque<String>, winget_id: &str) {
    queue.retain(|id| !id.eq_ignore_ascii_case(winget_id));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_install_upgrade_elevated() {
        assert_eq!(
            winget_id_of_task("winget:upgrade:7zip.7zip"),
            Some("7zip.7zip")
        );
        assert_eq!(winget_id_of_task("winget:install:Git.Git"), Some("Git.Git"));
        assert_eq!(
            winget_id_of_task("winget:elevated:Tencent.WeChat.Universal"),
            Some("Tencent.WeChat.Universal")
        );
        assert_eq!(winget_id_of_task("winget:uninstall:Git.Git"), None);
        assert_eq!(winget_id_of_task("process:foo"), None);
        assert_eq!(winget_id_of_task("winget:upgrade:"), None);
    }

    #[test]
    fn parses_id_with_extra_colons() {
        assert_eq!(
            winget_id_of_task("winget:upgrade:Foo.Bar:Baz"),
            Some("Foo.Bar:Baz")
        );
    }

    #[test]
    fn enqueue_dedups_and_caps() {
        let mut q = VecDeque::new();
        enqueue(
            &mut q,
            [
                "Git.Git".into(),
                "git.git".into(),
                "7zip.7zip".into(),
                "VLC.VLC".into(),
            ],
            None,
            None,
            2,
        );
        assert_eq!(
            q.iter().cloned().collect::<Vec<_>>(),
            vec!["Git.Git", "7zip.7zip"]
        );
    }

    #[test]
    fn enqueue_skips_inflight_and_counts_it_toward_cap() {
        let mut q = VecDeque::new();
        enqueue(
            &mut q,
            ["A".into(), "B".into(), "C".into()],
            Some("A"),
            None,
            2,
        );
        // A 正在下（占 1 个名额），再收 1 个 → 只有 B
        assert_eq!(q.iter().cloned().collect::<Vec<_>>(), vec!["B"]);
    }

    #[test]
    fn inflight_of_the_current_install_does_not_eat_lookahead() {
        let mut q = VecDeque::new();
        // B 正在下，同时也是当前安装项 → 名额全留给后面的 C、D
        enqueue(
            &mut q,
            ["C".into(), "D".into(), "E".into()],
            Some("B"),
            Some("B"),
            2,
        );
        assert_eq!(q.iter().cloned().collect::<Vec<_>>(), vec!["C", "D"]);
    }

    #[test]
    fn take_next_drops_the_package_currently_installing() {
        let mut q = VecDeque::from(["Git.Git".into(), "7zip.7zip".into()]);
        assert_eq!(take_next(&mut q, Some("git.git")), Some("7zip.7zip".into()));
        assert!(q.is_empty());
    }

    #[test]
    fn take_next_empty_or_all_skipped() {
        let mut q = VecDeque::from(["Git.Git".into()]);
        assert_eq!(take_next(&mut q, Some("Git.Git")), None);
        assert_eq!(take_next(&mut q, None), None);
    }

    #[test]
    fn remove_is_case_insensitive() {
        let mut q = VecDeque::from(["Git.Git".into(), "7zip.7zip".into()]);
        remove(&mut q, "git.git");
        assert_eq!(q.iter().cloned().collect::<Vec<_>>(), vec!["7zip.7zip"]);
    }
}
