//! 镜像中心：检测与一键配置各工具链的镜像源。
//!
//! 覆盖：winget / npm / pip / cargo / docker / go。
//! 原则：
//! - 配置文件（cargo config.toml、docker daemon.json）**只改我们管的那一段**，
//!   有标记块、幂等、可恢复 —— 绝不整文件覆写；
//! - CLI 类（npm/pip/go）走工具自己的 config 命令，交给工具落盘；
//! - 检测与应用分离，前端随时可刷新状态。

use crate::tools;

#[derive(Debug, Clone)]
pub struct MirrorStatus {
    pub tool: String,
    pub installed: bool,
    pub current: String,
}

// ---------- 纯函数：配置文件改写（带标记块，幂等） ----------

const MARK_BEGIN: &str = "# >>> tongtop-mirror >>>";
const MARK_END: &str = "# <<< tongtop-mirror <<<";

/// 去掉我们之前写入的标记块（幂等）。
pub fn strip_marked(content: &str) -> String {
    let mut out: Vec<&str> = Vec::new();
    let mut inside = false;
    for line in content.lines() {
        let t = line.trim();
        if t == MARK_BEGIN {
            inside = true;
            continue;
        }
        if t == MARK_END {
            inside = false;
            continue;
        }
        if !inside {
            out.push(line);
        }
    }
    let joined = out.join("\n");
    joined.trim_end().to_string()
}

/// cargo：写入（或替换）镜像块。registry 形如 `sparse+https://rsproxy.cn/index/`。
pub fn apply_cargo_mirror(existing: &str, registry: &str) -> String {
    let base = strip_marked(existing);
    let block = format!(
        "{MARK_BEGIN}\n[source.crates-io]\nreplace-with = \"tongtop-mirror\"\n\n[source.tongtop-mirror]\nregistry = \"{registry}\"\n{MARK_END}"
    );
    if base.is_empty() {
        format!("{block}\n")
    } else {
        format!("{base}\n\n{block}\n")
    }
}

/// cargo：恢复（删掉镜像块 = 回官方 crates.io）。
pub fn remove_cargo_mirror(existing: &str) -> String {
    let base = strip_marked(existing);
    if base.is_empty() {
        String::new()
    } else {
        format!("{base}\n")
    }
}

/// cargo：读当前镜像（找标记块或任何 replace-with 行）。
pub fn cargo_current(content: &str) -> Option<String> {
    let mut in_marked = false;
    for line in content.lines() {
        let t = line.trim();
        if t == MARK_BEGIN {
            in_marked = true;
        }
        if t == MARK_END {
            in_marked = false;
        }
        if in_marked && t.starts_with("registry") {
            if let Some(v) = t.split('=').nth(1) {
                return Some(v.trim().trim_matches('"').to_string());
            }
        }
    }
    // 没有标记块但用户自己配过 replace-with
    for line in content.lines() {
        let t = line.trim();
        if t.starts_with("replace-with") {
            return Some(t.to_string());
        }
    }
    None
}

/// docker：合并 registry-mirrors（保留 daemon.json 里的其他键）。
/// mirrors 为空时删除该键（= 恢复官方）。
pub fn apply_docker_mirrors(existing: &str, mirrors: &[String]) -> Result<String, String> {
    let mut v: serde_json::Value = if existing.trim().is_empty() {
        serde_json::json!({})
    } else {
        serde_json::from_str(existing).map_err(|e| format!("daemon.json 不是合法 JSON，未改动：{e}"))?
    };
    if !v.is_object() {
        return Err("daemon.json 顶层不是对象，未改动".into());
    }
    if mirrors.is_empty() {
        v.as_object_mut().unwrap().remove("registry-mirrors");
    } else {
        v["registry-mirrors"] = serde_json::json!(mirrors);
    }
    serde_json::to_string_pretty(&v).map_err(|e| e.to_string())
}

// ---------- 检测 ----------

fn home() -> std::path::PathBuf {
    std::env::var("USERPROFILE").map(Into::into).unwrap_or_default()
}

fn run_capture_cmd(program: &str, args: &[&str]) -> String {
    let mut cmd = if program.ends_with(".cmd") || program.ends_with(".bat") {
        let mut c = std::process::Command::new("cmd.exe");
        c.arg("/c").arg(program).args(args);
        c
    } else {
        let mut c = std::process::Command::new(program);
        c.args(args);
        c
    };
    cmd.stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    match cmd.output() {
        Ok(o) => {
            let bytes = if o.stdout.is_empty() { o.stderr } else { o.stdout };
            crate::winget::process::decode(&bytes).trim().to_string()
        }
        Err(e) => e.to_string(),
    }
}

pub fn detect_one(tool: &str) -> MirrorStatus {
    match tool {
        "npm" => {
            let path = tools::resolve("npm");
            let current = match &path {
                Some(p) => run_capture_cmd(p, &["config", "get", "registry"]),
                None => String::new(),
            };
            MirrorStatus { tool: tool.into(), installed: path.is_some(), current }
        }
        "pip" => {
            let path = tools::resolve("python");
            let current = match &path {
                Some(p) => {
                    let out = run_capture_cmd(p, &["-m", "pip", "config", "get", "global.index-url"]);
                    if out.is_empty() || out.contains("ERROR") || out.contains("No such") {
                        "https://pypi.org/simple（官方默认）".into()
                    } else {
                        out
                    }
                }
                None => String::new(),
            };
            MirrorStatus { tool: tool.into(), installed: path.is_some(), current }
        }
        "cargo" => {
            let cfg = home().join(r".cargo\config.toml");
            let legacy = home().join(r".cargo\config");
            let content = std::fs::read_to_string(&cfg)
                .or_else(|_| std::fs::read_to_string(&legacy))
                .unwrap_or_default();
            let current = cargo_current(&content)
                .unwrap_or_else(|| "https://github.com/rust-lang/crates.io-index（官方）".into());
            MirrorStatus { tool: tool.into(), installed: tools::resolve("cargo").is_some(), current }
        }
        "docker" => {
            let cfg = home().join(r".docker\daemon.json");
            let content = std::fs::read_to_string(&cfg).unwrap_or_default();
            let current = serde_json::from_str::<serde_json::Value>(&content)
                .ok()
                .and_then(|v| {
                    v.get("registry-mirrors")
                        .and_then(|m| m.as_array())
                        .and_then(|a| a.first())
                        .and_then(|s| s.as_str())
                        .map(|s| s.to_string())
                })
                .unwrap_or_else(|| "Docker Hub 官方".into());
            MirrorStatus { tool: tool.into(), installed: tools::resolve("docker").is_some(), current }
        }
        "go" => {
            let path = tools::resolve("go");
            let current = match &path {
                Some(p) => run_capture_cmd(p, &["env", "GOPROXY"]),
                None => String::new(),
            };
            MirrorStatus { tool: tool.into(), installed: path.is_some(), current }
        }
        "winget" => {
            let out = crate::winget::process::run_capture(&[
                "source".into(),
                "list".into(),
                "--accept-source-agreements".into(),
                "--disable-interactivity".into(),
            ])
            .unwrap_or_default();
            let current = if out.to_lowercase().contains("ustc") {
                "https://mirrors.ustc.edu.cn/winget-source（中科大镜像）".into()
            } else {
                "https://cdn.winget.microsoft.com/cache（官方）".into()
            };
            MirrorStatus { tool: tool.into(), installed: true, current }
        }
        _ => MirrorStatus { tool: tool.into(), installed: false, current: String::new() },
    }
}

pub fn detect_all(tools_list: &[String]) -> Vec<MirrorStatus> {
    let handles: Vec<_> = tools_list
        .iter()
        .map(|t| {
            let t = t.clone();
            std::thread::spawn(move || detect_one(&t))
        })
        .collect();
    handles.into_iter().filter_map(|h| h.join().ok()).collect()
}

// ---------- 应用 ----------

pub fn apply_one(tool: &str, value: &str) -> Result<String, String> {
    match tool {
        "npm" => {
            let p = tools::resolve("npm").ok_or("未找到 npm，请先安装 Node.js")?;
            Ok(run_capture_cmd(&p, &["config", "set", "registry", value]))
        }
        "pip" => {
            let p = tools::resolve("python").ok_or("未找到 python，请先安装 Python")?;
            Ok(run_capture_cmd(p.as_str(), &["-m", "pip", "config", "set", "global.index-url", value]))
        }
        "cargo" => {
            let dir = home().join(".cargo");
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            let cfg = dir.join("config.toml");
            let existing = std::fs::read_to_string(&cfg).unwrap_or_default();
            let next = if value.is_empty() {
                remove_cargo_mirror(&existing)
            } else {
                apply_cargo_mirror(&existing, value)
            };
            std::fs::write(&cfg, next).map_err(|e| format!("写入 {} 失败：{e}", cfg.display()))?;
            Ok(format!("已写入 {}", cfg.display()))
        }
        "docker" => {
            let dir = home().join(".docker");
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            let cfg = dir.join("daemon.json");
            let existing = std::fs::read_to_string(&cfg).unwrap_or_default();
            let mirrors: Vec<String> = if value.is_empty() {
                vec![]
            } else {
                vec![value.to_string()]
            };
            let next = apply_docker_mirrors(&existing, &mirrors)?;
            std::fs::write(&cfg, next).map_err(|e| format!("写入 {} 失败：{e}", cfg.display()))?;
            Ok(format!("已写入 {}（重启 Docker Desktop 后生效）", cfg.display()))
        }
        "go" => {
            let p = tools::resolve("go").ok_or("未找到 go，请先安装 Go")?;
            Ok(run_capture_cmd(&p, &["env", "-w", &format!("GOPROXY={value}")]))
        }
        "winget" => {
            // 先移除同名源（不存在则忽略错误），再以同参数添加，实现"切换"
            let _ = crate::winget::process::run_capture(&[
                "source".into(),
                "remove".into(),
                "--name".into(),
                "winget".into(),
                "--accept-source-agreements".into(),
                "--disable-interactivity".into(),
            ]);
            let out = crate::winget::process::run_capture(&[
                "source".into(),
                "add".into(),
                "--name".into(),
                "winget".into(),
                "--arg".into(),
                value.to_string(),
                "--accept-source-agreements".into(),
                "--disable-interactivity".into(),
            ])?;
            if out.contains("已添加") || out.to_lowercase().contains("added") || out.trim().is_empty() {
                Ok(format!("winget 源已切换为 {value}"))
            } else {
                // 失败时尽量还原官方源
                let _ = crate::winget::process::run_capture(&[
                    "source".into(),
                    "add".into(),
                    "--name".into(),
                    "winget".into(),
                    "--arg".into(),
                    "https://cdn.winget.microsoft.com/cache".into(),
                    "--accept-source-agreements".into(),
                    "--disable-interactivity".into(),
                ]);
                Err(format!("切换失败（可能需要管理员权限）：{out}"))
            }
        }
        _ => Err(format!("未知工具：{tool}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cargo_mirror_roundtrip() {
        let cfg = apply_cargo_mirror("", "sparse+https://rsproxy.cn/index/");
        assert!(cfg.contains("replace-with = \"tongtop-mirror\""));
        assert!(cfg.contains("sparse+https://rsproxy.cn/index/"));
        assert_eq!(
            cargo_current(&cfg).as_deref(),
            Some("sparse+https://rsproxy.cn/index/")
        );
        // 换成 USTC：旧块被替换而不是叠加
        let cfg2 = apply_cargo_mirror(&cfg, "sparse+https://mirrors.ustc.edu.cn/crates.io-index/");
        assert_eq!(cfg2.matches("[source.tongtop-mirror]").count(), 1);
        assert_eq!(cfg2.matches("replace-with = \"tongtop-mirror\"").count(), 1);
        assert_eq!(
            cargo_current(&cfg2).as_deref(),
            Some("sparse+https://mirrors.ustc.edu.cn/crates.io-index/")
        );
        // 恢复
        let cfg3 = remove_cargo_mirror(&cfg2);
        assert!(cfg3.trim().is_empty());
        assert!(cargo_current(&cfg3).is_none());
    }

    #[test]
    fn cargo_mirror_preserves_user_content() {
        let user = "[build]\njobs = 8\n";
        let cfg = apply_cargo_mirror(user, "sparse+https://rsproxy.cn/index/");
        assert!(cfg.contains("[build]"));
        assert!(cfg.contains("jobs = 8"));
        let back = remove_cargo_mirror(&cfg);
        assert_eq!(back, user);
    }

    #[test]
    fn docker_merge_keeps_other_keys() {
        let existing = r#"{"experimental": true, "registry-mirrors": ["https://old.example.com"]}"#;
        let out = apply_docker_mirrors(existing, &["https://docker.1ms.run".to_string()]).unwrap();
        let v: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["experimental"], true);
        assert_eq!(v["registry-mirrors"][0], "https://docker.1ms.run");
        // 恢复：空列表 = 删除键
        let out2 = apply_docker_mirrors(&out, &[]).unwrap();
        let v2: serde_json::Value = serde_json::from_str(&out2).unwrap();
        assert!(v2.get("registry-mirrors").is_none());
        assert_eq!(v2["experimental"], true);
    }

    #[test]
    fn docker_invalid_json_refused() {
        assert!(apply_docker_mirrors("{oops", &[]).is_err());
    }

    #[test]
    fn strip_marked_is_idempotent() {
        let s = strip_marked("a\n# >>> tongtop-mirror >>>\nb\n# <<< tongtop-mirror <<<\nc\n");
        assert_eq!(s, "a\nc");
        assert_eq!(strip_marked(&s), "a\nc");
    }
}
