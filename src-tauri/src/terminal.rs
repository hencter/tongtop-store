//! 内嵌终端：ConPTY 会话管理（portable-pty）。
//! 每个智能体启动 = 一条 PTY 会话：输出按事件流推给渲染窗口（xterm.js），
//! 输入/缩放/关闭原路回写。进程由我们直接 spawn —— env/PATH 注入 100% 可靠，
//! 彻底绕开 Windows Terminal 转发链的解析怪癖（裸名/分号/环境丢失）。

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;

use portable_pty::{Child, CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem};
use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager, State};

/// 单条会话：写入口 + 子进程句柄 + 输出回滚缓冲（新窗口挂载时补发）
pub struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
    backlog: Vec<u8>,
}

#[derive(Default)]
pub struct TermState(pub Mutex<HashMap<String, PtySession>>);

const BACKLOG_MAX: usize = 64 * 1024;

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TermSpec {
    pub program: String,
    pub args: Option<Vec<String>>,
    pub env: Option<HashMap<String, String>>,
    pub path_extra: Option<Vec<String>>,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
}

fn data_event(id: &str) -> String {
    format!("term-data-{id}")
}
fn exit_event(id: &str) -> String {
    format!("term-exit-{id}")
}

/// 启动一条 PTY 会话并流式输出。失败立即报错（不静默降级）。
#[tauri::command]
pub fn term_spawn(app: AppHandle, state: State<TermState>, id: String, spec: TermSpec) -> Result<(), String> {
    if state.0.lock().unwrap().contains_key(&id) {
        return Err(format!("会话已存在：{id}"));
    }

    let pty = NativePtySystem::default();
    let pair = pty
        .openpty(PtySize {
            rows: spec.rows.unwrap_or(30),
            cols: spec.cols.unwrap_or(120),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("创建终端失败：{e}"))?;

    // 与 tool_command 同款解析：工具名 → 全路径；.cmd/.bat 走 cmd.exe 中转
    let resolved = if spec.program.contains('\\') || spec.program.contains('/') {
        spec.program.clone()
    } else {
        crate::tools::resolve(&spec.program).unwrap_or_else(|| spec.program.clone())
    };
    let lower = resolved.to_lowercase();
    let mut cmd = if lower.ends_with(".cmd") || lower.ends_with(".bat") {
        let mut c = CommandBuilder::new("cmd.exe");
        c.arg("/c");
        c.arg(&resolved);
        c
    } else {
        CommandBuilder::new(&resolved)
    };
    for a in spec.args.unwrap_or_default() {
        cmd.arg(a);
    }
    // PATH 追加（%VAR% 展开）
    let extra: Vec<String> = spec
        .path_extra
        .unwrap_or_default()
        .iter()
        .map(|p| crate::tools::expand_vars(p))
        .collect();
    if !extra.is_empty() {
        let mut p = extra.join(";");
        if let Ok(cur) = std::env::var("PATH") {
            if !cur.is_empty() {
                p.push(';');
                p.push_str(&cur);
            }
        }
        cmd.env("PATH", p);
    }
    for (k, v) in spec.env.unwrap_or_default() {
        cmd.env(k, v);
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("启动失败：{e}（请确认已完成安装步骤）"))?;
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("读取终端失败：{e}"))?;
    let writer = pair.master.take_writer().map_err(|e| format!("写入终端失败：{e}"))?;

    state.0.lock().unwrap().insert(
        id.clone(),
        PtySession {
            master: pair.master,
            writer,
            child,
            backlog: Vec::new(),
        },
    );

    // 读线程：PTY 字节流 → 事件（UTF-8 无损转换；智能体均为 UTF-8 输出）
    let app2 = app.clone();
    let id2 = id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let chunk = buf[..n].to_vec();
                    // 回滚缓冲（窗口晚挂载时补发）
                    {
                        let app_state = app2.state::<TermState>();
                        let mut map = app_state.0.lock().unwrap();
                        if let Some(s) = map.get_mut(&id2) {
                            s.backlog.extend_from_slice(&chunk);
                            if s.backlog.len() > BACKLOG_MAX {
                                let drop = s.backlog.len() - BACKLOG_MAX;
                                s.backlog.drain(..drop);
                            }
                        }
                    }
                    let _ = app2.emit(&data_event(&id2), String::from_utf8_lossy(&chunk).into_owned());
                }
                Err(_) => break,
            }
        }
        // EOF → 取退出码，广播退出事件，清会话
        let code = {
            let app_state = app2.state::<TermState>();
            let mut map = app_state.0.lock().unwrap();
            map.get_mut(&id2).and_then(|s| s.child.wait().ok().map(|st| st.exit_code() as i64))
        };
        let _ = app2.emit(&exit_event(&id2), code.unwrap_or(-1));
        let app_state = app2.state::<TermState>();
        app_state.0.lock().unwrap().remove(&id2);
    });

    Ok(())
}

/// 新窗口挂载时补发回滚缓冲（覆盖挂载前的输出）
#[tauri::command]
pub fn term_backlog(state: State<TermState>, id: String) -> String {
    let map = state.0.lock().unwrap();
    map.get(&id)
        .map(|s| String::from_utf8_lossy(&s.backlog).into_owned())
        .unwrap_or_default()
}

#[tauri::command]
pub fn term_write(state: State<TermState>, id: String, data: String) -> Result<(), String> {
    let mut map = state.0.lock().unwrap();
    let s = map.get_mut(&id).ok_or("会话不存在（进程已退出）")?;
    s.writer
        .write_all(data.as_bytes())
        .and_then(|_| s.writer.flush())
        .map_err(|e| format!("写入失败：{e}"))
}

#[tauri::command]
pub fn term_resize(state: State<TermState>, id: String, cols: u16, rows: u16) -> Result<(), String> {
    let map = state.0.lock().unwrap();
    let s = map.get(&id).ok_or("会话不存在")?;
    s.master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("缩放失败：{e}"))
}

/// 窗口关闭即杀进程（会话随读线程 EOF 自动清理）
#[tauri::command]
pub fn term_kill(state: State<TermState>, id: String) -> Result<(), String> {
    let mut map = state.0.lock().unwrap();
    if let Some(s) = map.get_mut(&id) {
        let _ = s.child.kill();
    }
    Ok(())
}
