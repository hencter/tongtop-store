//! 后台文件活动监控：装了软件/启动软件后，谁在往用户目录写东西？
//!
//! 技术选型（为什么不是"进程级归因"）：
//! - 精确的进程级归因 = ProcMon 的领域（minifilter 驱动或 ETW FileIO，都要管理员）；
//! - 我们用 ReadDirectoryChangesW（notify crate，mimenote 监听 Vault 同款）监听
//!   用户目录的文件事件，按"前两级目录"聚合成组、1s 批量推送（去抖防风暴）；
//! - 再配一份"会话期间新出现的进程"快照（PowerShell Get-Process），
//!   用路径关联 + 新进程关联做**逼近归因**，并在 UI 上如实说明。
//!
//! 噪音纪律：%TEMP%（所有进程都在写）与商店自己的缓存目录默认排除。

use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use notify::{Event, EventKind, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::tools;

pub struct ActivitySession {
    pub alive: Arc<AtomicBool>,
    pub watcher: notify::RecommendedWatcher,
    pub started: Instant,
}

#[derive(Debug, Clone, Default)]
struct Group {
    count: u64,
    latest: Vec<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GroupDto {
    pub key: String,
    pub count: u64,
    pub latest: Vec<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BatchDto {
    groups: Vec<GroupDto>,
    total: u64,
    elapsed_ms: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProcDto {
    pub pid: u32,
    pub name: String,
    pub started_ms: u64,
}

/// 相对路径的前两级作为聚合键（"Tencent\WeChat\…" → "Tencent\WeChat"）。
pub fn top2(rel: &str) -> String {
    let mut parts = rel.split(['\\', '/']).filter(|s| !s.is_empty());
    match (parts.next(), parts.next()) {
        (Some(a), Some(b)) => format!("{a}\\{b}"),
        (Some(a), None) => a.to_string(),
        _ => rel.to_string(),
    }
}

/// 噪音目录：Temp（所有进程都在写）、商店自己的缓存、回收站。
pub fn is_noise(rel: &str) -> bool {
    let lower = rel.to_lowercase();
    let first = lower.split(['\\', '/']).next().unwrap_or("");
    first == "temp" || first == "$recycle.bin" || lower.contains("com.tongtianlu.store")
}

/// 启动监控会话（重复调用 = 重启会话）。watcher 由调用方放进 AppState 持有。
/// roots 允许 %VAR% 占位（%APPDATA% 等），在这里展开。
pub fn start(app: AppHandle, roots: Vec<String>) -> Result<ActivitySession, String> {
    let roots: Vec<String> = roots.iter().map(|r| tools::expand_vars(r)).collect();
    let groups = Arc::new(Mutex::new(HashMap::<String, Group>::new()));
    let alive = Arc::new(AtomicBool::new(true));
    let roots_c = roots.clone();
    let groups_c = groups.clone();

    let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        let Ok(ev) = res else { return };
        if matches!(ev.kind, EventKind::Other) {
            return;
        }
        for path in &ev.paths {
            let rel = roots_c
                .iter()
                .find_map(|r| path.strip_prefix(r).ok())
                .map(|p| p.to_string_lossy().into_owned())
                .unwrap_or_else(|| path.to_string_lossy().into_owned());
            if is_noise(&rel) {
                continue;
            }
            let key = top2(&rel);
            let mut g = groups_c.lock().unwrap();
            let e = g.entry(key).or_default();
            e.count += 1;
            if e.latest.len() < 3 {
                e.latest.push(rel);
            }
        }
    })
    .map_err(|e| format!("无法创建文件监听器：{e}"))?;

    for r in &roots {
        if !Path::new(r).is_dir() {
            return Err(format!("目录不存在：{r}"));
        }
        watcher
            .watch(Path::new(r), RecursiveMode::Recursive)
            .map_err(|e| format!("监听 {r} 失败：{e}"))?;
    }

    // 1s 批量推送（mimenote 去抖纪律：合并、限量、不让前端被事件风暴淹没）
    let alive_c = alive.clone();
    let started = Instant::now();
    std::thread::spawn(move || {
        let mut total: u64 = 0;
        while alive_c.load(Ordering::Relaxed) {
            std::thread::sleep(Duration::from_millis(1000));
            let batch: Vec<GroupDto> = {
                let mut g = groups.lock().unwrap();
                if g.is_empty() {
                    continue;
                }
                let taken = std::mem::take(&mut *g);
                let mut v: Vec<GroupDto> = taken
                    .into_iter()
                    .map(|(key, grp)| {
                        total += grp.count;
                        GroupDto {
                            key,
                            count: grp.count,
                            latest: grp.latest,
                        }
                    })
                    .collect();
                v.sort_by(|a, b| b.count.cmp(&a.count));
                v.truncate(20);
                v
            };
            let _ = app.emit(
                "activity-batch",
                BatchDto {
                    groups: batch,
                    total,
                    elapsed_ms: started.elapsed().as_millis() as u64,
                },
            );
        }
    });

    Ok(ActivitySession {
        alive,
        watcher,
        started,
    })
}

pub fn stop(session: Option<ActivitySession>) {
    if let Some(s) = session {
        s.alive.store(false, Ordering::Relaxed);
        drop(s.watcher);
    }
}

/// 进程快照（pid / 名称 / 启动时间 ms）——前端用于"会话期间新出现的进程"对比。
pub fn processes() -> Vec<ProcDto> {
    let script = "Get-Process | Select-Object Id,ProcessName,StartTime | ConvertTo-Json -Compress";
    let Ok(out) = tools::powershell(script) else {
        return vec![];
    };
    let Ok(v) = serde_json::from_str::<serde_json::Value>(&out) else {
        return vec![];
    };
    let arr = match v {
        serde_json::Value::Array(a) => a,
        one @ serde_json::Value::Object(_) => vec![one],
        _ => return vec![],
    };
    arr.iter()
        .filter_map(|p| {
            let pid = p.get("Id").and_then(|x| x.as_u64())? as u32;
            let name = p.get("ProcessName").and_then(|x| x.as_str())?.to_string();
            // ConvertTo-Json 的 DateTime 形如 "/Date(1695123456789)/"
            let started_ms = p
                .get("StartTime")
                .and_then(|x| x.as_str())
                .and_then(|s| {
                    let l = s.find('(')? + 1;
                    let r = s[l..].find(')')? + l;
                    s[l..r].parse::<u64>().ok()
                })
                .unwrap_or(0);
            Some(ProcDto {
                pid,
                name,
                started_ms,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn top2_groups_two_levels() {
        assert_eq!(top2(r"Tencent\WeChat\xyz\log.txt"), r"Tencent\WeChat");
        assert_eq!(top2(r"Microsoft\file.dat"), r"Microsoft\file.dat"); // 顶层文件自成一组
        assert_eq!(top2("single"), "single");
        assert_eq!(top2(r"Tencent/WeChat/a.db"), r"Tencent\WeChat");
    }

    #[test]
    fn noise_rules() {
        assert!(is_noise(r"Temp\xxx.tmp"));
        assert!(is_noise(r"com.tongtianlu.store\cache\store.db"));
        assert!(!is_noise(r"Tencent\WeChat\msg.db"));
    }
}
