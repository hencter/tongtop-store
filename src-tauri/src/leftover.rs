//! Geek Uninstaller 式残留清理：winget 卸载后扫描残留——
//! 注册表（Uninstall 卸载项 + Software 配置键）与 AppData 数据目录，
//! 列出明细，用户确认后删除。
//!
//! 安全纪律（宁可漏报，绝不误删）：
//! - 匹配 token ≥ 4 字符（包 ID 末段 + 名称里的词），如 wechat / potplayer；
//! - 目录只删 %APPDATA% / %LOCALAPPDATA% / %PROGRAMDATA% 的**一级子目录**；
//! - 注册表只删 Uninstall / Software 根下的键（HKLM 删除需管理员，失败如实跳过）。

use crate::tools;

#[derive(Debug, Clone)]
pub struct LeftoverRegistry {
    /// reg.exe 可用的完整键路径（HKEY_...\...）
    pub key: String,
    pub name: String,
    /// uninstall = 卸载项残留；software = Software 配置键
    pub kind: String,
}

#[derive(Debug, Clone)]
pub struct LeftoverDir {
    pub path: String,
    pub size: u64,
}

#[derive(Debug, Clone, Default)]
pub struct LeftoverReport {
    pub registry: Vec<LeftoverRegistry>,
    pub dirs: Vec<LeftoverDir>,
}

#[derive(Debug, Clone, Default)]
pub struct CleanReport {
    pub freed_bytes: u64,
    pub dirs_deleted: u32,
    pub dirs_skipped: u32,
    pub keys_deleted: u32,
    pub keys_skipped: u32,
}

/// 匹配 token：包 ID 末段 + 名称单词，≥4 字符，小写去重。
pub fn match_tokens(id: &str, name: &str) -> Vec<String> {
    let mut tokens: Vec<String> = Vec::new();
    if let Some(last) = id.rsplit('.').next() {
        let t = last.to_lowercase();
        if t.len() >= 4 {
            tokens.push(t);
        }
    }
    for w in name.split(|c: char| !c.is_alphanumeric()) {
        let t = w.to_lowercase();
        if t.len() >= 4 && !tokens.contains(&t) {
            tokens.push(t);
        }
    }
    tokens
}

fn matches(hay: &str, tokens: &[String]) -> bool {
    let h = hay.to_lowercase();
    tokens.iter().any(|t| h.contains(t))
}

const REG_SCRIPT: &str = concat!(
    "$ErrorActionPreference='SilentlyContinue';",
    "Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',",
    "'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',",
    "'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' | ",
    "Where-Object {$_.DisplayName} | ForEach-Object { 'U' + \"`t\" + $_.PSPath + \"`t\" + $_.DisplayName };",
    "Get-ChildItem 'HKCU:\\Software','HKLM:\\Software' | ForEach-Object { 'S' + \"`t\" + $_.PSPath + \"`t\" + $_.PSChildName }"
);

/// PSPath（Microsoft.PowerShell.Core\Registry::HKEY_...）→ reg.exe 可用的路径。
pub fn ps_path_to_reg(pspath: &str) -> Option<String> {
    let idx = pspath.find("::")?;
    Some(pspath[idx + 2..].to_string())
}

/// 解析注册表枚举输出（"U\t<pspath>\t<name>" / "S\t<pspath>\t<name>"）。
pub fn parse_reg_enum(output: &str, tokens: &[String]) -> Vec<LeftoverRegistry> {
    let mut out = Vec::new();
    for line in output.lines() {
        let mut parts = line.splitn(3, '\t');
        let (Some(tag), Some(pspath), Some(name)) = (parts.next(), parts.next(), parts.next()) else {
            continue;
        };
        let name = name.trim();
        if name.is_empty() || !matches(name, tokens) {
            continue;
        }
        let Some(key) = ps_path_to_reg(pspath.trim()) else {
            continue;
        };
        out.push(LeftoverRegistry {
            key,
            name: name.to_string(),
            kind: if tag.trim() == "U" { "uninstall" } else { "software" }.to_string(),
        });
    }
    out
}

fn appdata_roots() -> Vec<std::path::PathBuf> {
    ["APPDATA", "LOCALAPPDATA", "PROGRAMDATA"]
        .iter()
        .filter_map(|k| std::env::var(k).ok())
        .map(std::path::PathBuf::from)
        .collect()
}

pub fn scan(id: &str, name: &str) -> LeftoverReport {
    let tokens = match_tokens(id, name);
    let mut report = LeftoverReport::default();
    if tokens.is_empty() {
        return report;
    }
    // 注册表（一次 PowerShell 调用枚举三个 Uninstall 根 + Software 根）
    if let Ok(out) = tools::powershell(REG_SCRIPT) {
        report.registry = parse_reg_enum(&out, &tokens);
    }
    // AppData 一级子目录
    for root in appdata_roots() {
        if let Ok(rd) = std::fs::read_dir(&root) {
            for e in rd.flatten() {
                let Ok(meta) = e.metadata() else {
                    continue;
                };
                if !meta.is_dir() {
                    continue;
                }
                let dirname = e.file_name().to_string_lossy().into_owned();
                if matches(&dirname, &tokens) {
                    let (size, _) = crate::cleanup::dir_size(&e);
                    report.dirs.push(LeftoverDir {
                        path: e.path().to_string_lossy().into_owned(),
                        size,
                    });
                }
            }
        }
    }
    report.dirs.sort_by_key(|d| std::cmp::Reverse(d.size));
    report
}

fn path_under_root(path: &std::path::Path) -> bool {
    let p = path.to_string_lossy().to_lowercase();
    appdata_roots().iter().any(|r| {
        let root = r.to_string_lossy().to_lowercase();
        p.starts_with(&root) && p.len() > root.len() + 1
    })
}

fn key_allowed(key: &str) -> bool {
    let k = key.to_uppercase();
    (k.starts_with("HKEY_LOCAL_MACHINE\\SOFTWARE\\")
        || k.starts_with("HKEY_CURRENT_USER\\SOFTWARE\\")
        || k.starts_with("HKEY_CURRENT_USER\\"))
        && (k.contains("\\UNINSTALL\\") || k.contains("SOFTWARE\\"))
}

pub fn clean(dirs: &[String], keys: &[String]) -> CleanReport {
    let mut r = CleanReport::default();
    for d in dirs {
        let p = std::path::PathBuf::from(d);
        // 守卫：必须是 AppData 根的一级子目录（防止把参数拼成别的路径）
        let depth_ok = appdata_roots().iter().any(|root| {
            p.parent().is_some_and(|parent| parent == root.as_path())
        });
        if !depth_ok || !path_under_root(&p) {
            r.dirs_skipped += 1;
            continue;
        }
        // 先算大小再删
        let size = std::fs::read_dir(&p)
            .ok()
            .and_then(|mut rd| rd.next())
            .and_then(|first| first.ok())
            .map(|e| crate::cleanup::dir_size(&e).0)
            .unwrap_or(0);
        match std::fs::remove_dir_all(&p) {
            Ok(_) => {
                r.freed_bytes += size;
                r.dirs_deleted += 1;
            }
            Err(_) => r.dirs_skipped += 1,
        }
    }
    for k in keys {
        if !key_allowed(k) {
            r.keys_skipped += 1;
            continue;
        }
        match tools::run_quiet("reg", &["delete", k, "/f"]) {
            Ok(_) => r.keys_deleted += 1,
            Err(_) => r.keys_skipped += 1, // HKLM 无管理员权限会落这里
        }
    }
    r
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokens_from_id_and_name() {
        assert_eq!(match_tokens("Tencent.WeChat", "WeChat"), vec!["wechat"]);
        assert_eq!(
            match_tokens("Daum.PotPlayer", "PotPlayer"),
            vec!["potplayer"]
        );
        // 短 token 丢弃（避免 git → Digital 误匹配）
        assert!(match_tokens("Git.Git", "Git").is_empty());
        // 名称多词
        let t = match_tokens("Kingsoft.WPSOffice", "WPS Office");
        assert!(t.contains(&"wpsoffice".to_string()));
        assert!(t.contains(&"office".to_string()));
    }

    #[test]
    fn parse_registry_enum_output() {
        let ps = "U\tMicrosoft.PowerShell.Core\\Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\WeChat\tWeChat\n\
                  S\tMicrosoft.PowerShell.Core\\Registry::HKEY_CURRENT_USER\\Software\\Tencent\tTencent\n\
                  U\tMicrosoft.PowerShell.Core\\Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Chrome\tGoogle Chrome\n";
        let tokens = match_tokens("Tencent.WeChat", "WeChat");
        let items = parse_reg_enum(ps, &tokens);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].kind, "uninstall");
        assert!(items[0].key.starts_with("HKEY_LOCAL_MACHINE"));
        assert!(!items[0].key.contains("PowerShell.Core"));
        // Tencent 不匹配 wechat，Chrome 不匹配
    }

    #[test]
    fn ps_path_conversion() {
        assert_eq!(
            ps_path_to_reg("Microsoft.PowerShell.Core\\Registry::HKEY_CURRENT_USER\\Software\\X"),
            Some(r"HKEY_CURRENT_USER\Software\X".to_string())
        );
        assert!(ps_path_to_reg("no-colons").is_none());
    }

    #[test]
    fn key_guard() {
        assert!(key_allowed(r"HKEY_CURRENT_USER\Software\Tencent\WeChat"));
        assert!(key_allowed(
            r"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\WeChat"
        ));
        assert!(!key_allowed(r"HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet"));
    }
}
