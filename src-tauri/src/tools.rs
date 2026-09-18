//! 工具链检测与解析：winget 装完 Node/Python 后，当前进程 PATH 是旧的，
//! 所以除了 `where.exe`，还要按"已知安装位置"兜底解析 —— 这是装机流水线
//! 能在同一会话里连续跑通的关键。
//!
//! 所有函数不依赖 tauri，可独立单测。

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::{Command, Stdio};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolStatus {
    pub name: String,
    pub installed: bool,
    pub path: Option<String>,
    pub version: Option<String>,
}

fn env_path(key: &str) -> PathBuf {
    std::env::var(key).map(PathBuf::from).unwrap_or_default()
}

/// 各工具的常见安装位置（winget/官方安装包的默认落点）。
pub fn known_locations(name: &str) -> Vec<PathBuf> {
    let pf = env_path("ProgramFiles");
    let pf86 = env_path("ProgramFiles(x86)");
    let local = env_path("LOCALAPPDATA");
    let roaming = env_path("APPDATA");
    let home = env_path("USERPROFILE");
    match name {
        "node" => vec![pf.join(r"nodejs\node.exe")],
        "npm" => vec![pf.join(r"nodejs\npm.cmd")],
        "pnpm" => vec![local.join(r"pnpm\pnpm.cmd")],
        "yarn" => vec![
            pf86.join(r"Yarn\bin\yarn.cmd"),
            pf.join(r"Yarn\bin\yarn.cmd"),
        ],
        "bun" => vec![home.join(r".bun\bin\bun.exe")],
        "uv" => vec![
            home.join(r".local\bin\uv.exe"),
            local.join(r"Programs\uv\uv.exe"),
        ],
        "dotnet" => vec![pf.join(r"dotnet\dotnet.exe")],
        "gem" => vec![
            PathBuf::from(r"C:\Ruby34-x64\bin\gem.cmd"),
            PathBuf::from(r"C:\Ruby33-x64\bin\gem.cmd"),
        ],
        "python" => vec![
            local.join(r"Programs\Python\Python313\python.exe"),
            local.join(r"Programs\Python\Python312\python.exe"),
            pf.join(r"Python313\python.exe"),
            pf.join(r"Python312\python.exe"),
            local.join(r"Programs\Python\Launcher\py.exe"),
        ],
        "pip" => vec![
            local.join(r"Programs\Python\Python313\Scripts\pip.exe"),
            local.join(r"Programs\Python\Python312\Scripts\pip.exe"),
        ],
        "cargo" => vec![home.join(r".cargo\bin\cargo.exe")],
        "go" => vec![pf.join(r"Go\bin\go.exe")],
        // Windows Terminal（应用执行别名，装完即在此）
        "wt" => vec![local.join(r"Microsoft\WindowsApps\wt.exe")],
        "docker" => vec![pf.join(r"Docker\Docker\resources\bin\docker.exe")],
        "ollama" => vec![local.join(r"Programs\Ollama\ollama.exe")],
        "aider" => vec![
            local.join(r"Programs\Python\Python313\Scripts\aider.exe"),
            local.join(r"Programs\Python\Python312\Scripts\aider.exe"),
        ],
        "interpreter" => vec![
            local.join(r"Programs\Python\Python313\Scripts\interpreter.exe"),
            local.join(r"Programs\Python\Python312\Scripts\interpreter.exe"),
        ],
        "sgpt" => vec![
            local.join(r"Programs\Python\Python313\Scripts\sgpt.exe"),
            local.join(r"Programs\Python\Python312\Scripts\sgpt.exe"),
        ],
        // npm 全局安装的 CLI 都落在 %APPDATA%\npm（兜底规则，新增 CLI 无需逐个登记）
        _ if !name.contains('\\') && !name.contains('/') => {
            vec![roaming.join(format!(r"npm\{name}.cmd"))]
        }
        _ => vec![],
    }
}

/// 解析工具可执行文件：已知安装位置优先（纯文件检查，零进程开销、零窗口风险），
/// `where.exe` 仅作兜底 —— 且必须 CREATE_NO_WINDOW，否则 GUI 应用（无控制台子系统）
/// 每调一次就闪出一个控制台窗口（这正是"点哪里都疯狂弹窗"的根因）。
pub fn resolve(name: &str) -> Option<String> {
    if let Some(p) = known_locations(name).into_iter().find(|p| p.is_file()) {
        return Some(p.to_string_lossy().into_owned());
    }
    let mut cmd = std::process::Command::new("where.exe");
    cmd.arg(name)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    if let Ok(out) = cmd.output() {
        if out.status.success() {
            let stdout = String::from_utf8_lossy(&out.stdout);
            if let Some(first) = stdout.lines().map(|l| l.trim()).find(|l| !l.is_empty()) {
                return Some(first.to_string());
            }
        }
    }
    None
}

/// 取版本号（`--version` 首行，截断）。.cmd 需要 cmd.exe 中转。
/// 黑名单：wt.exe 不认 --version，且它是 GUI 启动器——调用可能直接弹出一个终端窗口。
const NO_VERSION: &[&str] = &["wt"];

pub fn version_of(resolved: &str) -> Option<String> {
    let mut cmd = if resolved.ends_with(".cmd") || resolved.ends_with(".bat") {
        let mut c = std::process::Command::new("cmd.exe");
        c.args(["/c", resolved, "--version"]);
        c
    } else {
        let mut c = std::process::Command::new(resolved);
        c.arg("--version");
        c
    };
    cmd.stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let out = cmd.output().ok()?;
    if !out.status.success() {
        return None;
    }
    let text = crate::winget::process::decode(&out.stdout);
    text.lines()
        .map(|l| l.trim())
        .find(|l| !l.is_empty())
        .map(|l| l.chars().take(60).collect())
}

/// 批量检测（每个工具一个线程，总耗时 ≈ 最慢的那个，而不是求和）。
pub fn check_tools(names: &[String]) -> Vec<ToolStatus> {
    let handles: Vec<_> = names
        .iter()
        .map(|n| {
            let n = n.clone();
            std::thread::spawn(move || {
                let path = resolve(&n);
                let version = if NO_VERSION.contains(&n.as_str()) {
                    None
                } else {
                    path.as_deref().and_then(version_of)
                };
                ToolStatus {
                    installed: path.is_some(),
                    path,
                    version,
                    name: n,
                }
            })
        })
        .collect();
    handles.into_iter().filter_map(|h| h.join().ok()).collect()
}

/// Windows 下不弹控制台黑窗。
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
/// 为智能体分配独立控制台窗口（launch 用）。
#[cfg(windows)]
const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;

/// 展开 `%VAR%`（path_extra / 配置里允许写 %APPDATA% 这类占位）。
pub fn expand_vars(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(i) = rest.find('%') {
        out.push_str(&rest[..i]);
        let tail = &rest[i + 1..];
        match tail.find('%') {
            Some(j) if j > 0 => {
                let name = &tail[..j];
                if name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
                    out.push_str(&std::env::var(name).unwrap_or_else(|_| format!("%{name}%")));
                    rest = &tail[j + 1..];
                } else {
                    out.push('%');
                    rest = tail;
                }
            }
            _ => {
                out.push('%');
                rest = tail;
            }
        }
    }
    out.push_str(rest);
    out
}

/// 构造工具命令：解析程序名、.cmd 走 cmd.exe 中转、可追加 PATH 前缀与环境变量。
/// 返回 (Command, 解析后的程序路径)。
pub fn tool_command(
    program: &str,
    args: &[String],
    path_extra: &[String],
    env: &HashMap<String, String>,
    new_console: bool,
) -> (Command, String) {
    // 含路径分隔符的按完整路径用；否则按工具名解析（where + 已知位置）
    let resolved = if program.contains('\\') || program.contains('/') {
        program.to_string()
    } else {
        resolve(program).unwrap_or_else(|| program.to_string())
    };
    let lower = resolved.to_lowercase();
    let mut cmd = if lower.ends_with(".cmd") || lower.ends_with(".bat") {
        let mut c = Command::new("cmd.exe");
        c.arg("/c").arg(&resolved).args(args);
        c
    } else {
        let mut c = Command::new(&resolved);
        c.args(args);
        c
    };
    if !path_extra.is_empty() {
        let expanded: Vec<String> = path_extra.iter().map(|p| expand_vars(p)).collect();
        let mut p = expanded.join(";");
        if let Ok(cur) = std::env::var("PATH") {
            if !cur.is_empty() {
                p.push(';');
                p.push_str(&cur);
            }
        }
        cmd.env("PATH", p);
    }
    for (k, v) in env {
        cmd.env(k, v);
    }
    cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(if new_console {
            CREATE_NEW_CONSOLE
        } else {
            CREATE_NO_WINDOW
        });
    }
    (cmd, resolved)
}

fn ps_escape(s: &str) -> String {
    s.replace('\'', "''")
}

pub fn powershell(script: &str) -> Result<String, String> {
    let mut cmd = Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-NonInteractive", "-Command", script])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let out = cmd.output().map_err(|e| format!("无法启动 PowerShell：{e}"))?;
    let bytes = if out.stdout.is_empty() {
        &out.stderr
    } else {
        &out.stdout
    };
    Ok(crate::winget::process::decode(bytes))
}

/// 批量读用户级环境变量（一次 PowerShell 调用拿全部）。
pub fn get_user_envs(names: &[String]) -> HashMap<String, String> {
    let mut out = HashMap::new();
    if names.is_empty() {
        return out;
    }
    let script = names
        .iter()
        .map(|n| {
            format!(
                "Write-Output ('{}=' + [Environment]::GetEnvironmentVariable('{}','User'))",
                ps_escape(n),
                ps_escape(n)
            )
        })
        .collect::<Vec<_>>()
        .join("; ");
    if let Ok(text) = powershell(&script) {
        for line in text.lines() {
            if let Some((k, v)) = line.split_once('=') {
                let v = v.trim();
                if !v.is_empty() {
                    out.insert(k.trim().to_string(), v.to_string());
                }
            }
        }
    }
    out
}

/// 写用户级环境变量（新开的终端/进程可见；本进程内不生效）。
pub fn set_user_env(name: &str, value: &str) -> Result<(), String> {
    let script = format!(
        "[Environment]::SetEnvironmentVariable('{}','{}','User')",
        ps_escape(name),
        ps_escape(value)
    );
    let out = powershell(&script)?;
    if out.contains("Exception") || out.contains("错误") {
        return Err(out);
    }
    Ok(())
}

/// 静默跑一个命令并收集输出（无窗口；.cmd/.bat 自动走 cmd.exe 中转）。
/// 退出码非 0 视为 Err（带 stderr 内容）。
pub fn run_quiet(program: &str, args: &[&str]) -> Result<String, String> {
    let mut cmd = if program.ends_with(".cmd") || program.ends_with(".bat") {
        let mut c = Command::new("cmd.exe");
        c.arg("/c").arg(program).args(args);
        c
    } else {
        let mut c = Command::new(program);
        c.args(args);
        c
    };
    cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let out = cmd
        .output()
        .map_err(|e| format!("无法启动 {program}：{e}"))?;
    if !out.status.success() {
        return Err(crate::winget::process::decode(&out.stderr).trim().to_string());
    }
    Ok(crate::winget::process::decode(&out.stdout))
}

// ---------- 桌面端（GUI）启动：开始菜单 AppID 解析 ----------

/// 列出开始菜单全部应用（一次 PowerShell 调用；批量检测桌面端安装状态用）。
pub fn list_start_apps() -> Vec<(String, String)> {
    let script = "Get-StartApps | ForEach-Object { $_.Name + '|' + $_.AppID }";
    let out = match powershell(script) {
        Ok(t) => t,
        Err(_) => return Vec::new(),
    };
    out.lines()
        .filter_map(|line| {
            let (name, appid) = line.trim().split_once('|')?;
            let (name, appid) = (name.trim(), appid.trim());
            (!name.is_empty() && !appid.is_empty()).then(|| (name.to_string(), appid.to_string()))
        })
        .collect()
}

/// 按开始菜单快捷方式名查找 AppID（任一匹配词命中即返回）。
/// winget 装的 GUI 应用 exe 落点各异，但开始菜单快捷方式稳定存在。
pub fn find_start_app(names: &[String]) -> Option<String> {
    let needles: Vec<String> = names.iter().map(|n| n.to_lowercase()).collect();
    list_start_apps().into_iter().find_map(|(name, appid)| {
        let lname = name.to_lowercase();
        needles
            .iter()
            .any(|n| !n.is_empty() && lname.contains(n.as_str()))
            .then_some(appid)
    })
}

/// 经 shell:AppsFolder 启动开始菜单里的应用（GUI 桌面端通用启动法）。
pub fn launch_start_app(names: &[String]) -> Result<(), String> {
    let appid = find_start_app(names)
        .ok_or_else(|| "开始菜单中未找到该应用（可能尚未安装完成）".to_string())?;
    let target = format!("shell:AppsFolder\\{appid}");
    let mut cmd = Command::new("explorer.exe");
    cmd.arg(&target);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd.spawn().map_err(|e| format!("启动失败：{e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_locations_are_absolute() {
        // 在装了 node 的机器上，npm 应解析到 npm.cmd 或 where 能找到；
        // 这里只断言已知位置构造不 panic 且形如路径
        let locs = known_locations("npm");
        assert!(!locs.is_empty());
        assert!(locs[0].to_string_lossy().contains("npm.cmd"));
    }

    #[test]
    fn where_finds_windows_builtin() {
        // cmd.exe 一定存在
        assert!(resolve("cmd").is_some());
    }

    #[test]
    fn expand_vars_works() {
        std::env::set_var("TONGTOP_TEST_VAR", r"D:\somewhere");
        assert_eq!(expand_vars(r"%TONGTOP_TEST_VAR%\bin"), r"D:\somewhere\bin");
        assert_eq!(expand_vars("100%"), "100%");
        assert_eq!(expand_vars("%NO_SUCH_VAR_XYZ%"), "%NO_SUCH_VAR_XYZ%");
    }
}
