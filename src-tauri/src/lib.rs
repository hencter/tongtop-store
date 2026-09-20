//! 通天路软件商店 —— Tauri 宿主。
//!
//! 宿主只做三件事（业务判据都在各模块里）：
//! 1. 把 winget / 工具链 / 镜像 / 缓存能力暴露成 IPC 命令；
//! 2. 管理"同一时刻只有一个任务"的状态机（winget 源锁也 hold 不住并发）；
//! 3. 把任务输出字节流按时间窗合并成事件推给前端。

mod activity;
mod cleanup;
mod gh;
mod index_db;
mod leftover;
mod mirror;
mod terminal;
mod tools;
mod winget;

use std::collections::HashMap;
use std::process::Child;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use winget::{process, table};

// ---------- DTO ----------

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub id: String,
    pub version: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpgradeInfo {
    pub name: String,
    pub id: String,
    pub version: String,
    pub available: String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppDetail {
    pub id: String,
    pub name: String,
    pub version: String,
    pub publisher: String,
    pub homepage: String,
    pub description: String,
    pub urls: Vec<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatusDto {
    pub name: String,
    pub installed: bool,
    pub path: Option<String>,
    pub version: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MirrorStatusDto {
    pub tool: String,
    pub installed: bool,
    pub current: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TaskStarted {
    id: String,
    label: String,
    command: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TaskQueued {
    id: String,
    label: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TaskLog {
    id: String,
    lines: Vec<String>,
    /// 从输出里解析到的下载进度（0–100），无则 None
    progress: Option<u8>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TaskDone {
    id: String,
    code: i32,
    success: bool,
    error_tail: Vec<String>,
}

// ---------- 任务规格 ----------

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaskSpec {
    /// "winget" | "process" | "download"
    kind: String,
    /// winget: install | upgrade | uninstall
    action: Option<String>,
    winget_id: Option<String>,
    silent: Option<bool>,
    /// process: 程序名（可解析的工具名或完整路径）
    program: Option<String>,
    args: Option<Vec<String>>,
    /// 追加到子进程 PATH 前面的目录（winget 刚装好 Node 时 PATH 还没刷新）
    path_extra: Option<Vec<String>>,
    /// 面板显示名
    display: Option<String>,
    /// winget install 的 --location（自定义安装目录，如 D:\Apps；安装器不支持时由 winget 忽略）
    location: Option<String>,
    /// download 任务：安装包直链（官网解析所得）
    url: Option<String>,
}

fn winget_action_args(action: &str, id: &str, silent: bool, location: Option<&str>) -> Result<Vec<String>, String> {
    let mut args: Vec<String> = match action {
        "install" | "upgrade" => vec![
            action.into(),
            "-e".into(),
            "--id".into(),
            id.into(),
            "--source".into(),
            "winget".into(),
            "--accept-source-agreements".into(),
            "--accept-package-agreements".into(),
            "--disable-interactivity".into(),
        ],
        "uninstall" => vec![
            "uninstall".into(),
            "-e".into(),
            "--id".into(),
            id.into(),
            "--source".into(),
            "winget".into(),
            "--accept-source-agreements".into(),
            "--disable-interactivity".into(),
        ],
        other => return Err(format!("未知 winget 动作：{other}")),
    };
    if silent {
        args.push("-h".into());
    }
    // 自定义安装目录（仅 install 支持；安装器不认时 winget 自行忽略）
    if action == "install" {
        if let Some(loc) = location.filter(|l| !l.trim().is_empty()) {
            args.push("--location".into());
            args.push(loc.trim().to_string());
        }
    }
    Ok(args)
}

/// 准备好的任务：可直接跑的命令，或「先下载安装包再静默安装」两段式
enum Prepared {
    Cmd(std::process::Command, String),
    Download { url: String, args: Vec<String> },
}

fn spec_command(spec: &TaskSpec) -> Result<(Prepared, String), String> {
    match spec.kind.as_str() {
        "download" => {
            // 官网直链下载安装：解析来的安装包 URL → 下载 → 静默安装（args 为静默参数）
            let url = spec.url.clone().ok_or("缺少下载链接")?;
            let label = spec
                .display
                .clone()
                .unwrap_or_else(|| "下载并安装".into());
            Ok((
                Prepared::Download {
                    url: url.clone(),
                    args: spec.args.clone().unwrap_or_default(),
                },
                label,
            ))
        }
        "winget" => {
            let action = spec.action.clone().unwrap_or_else(|| "install".into());
            if action == "upgrade_all" {
                // 一键更新：winget upgrade --all，一条命令流式跑完全部
                let mut args: Vec<String> = vec![
                    "upgrade".into(),
                    "--all".into(),
                    "--source".into(),
                    "winget".into(),
                    "--accept-source-agreements".into(),
                    "--accept-package-agreements".into(),
                    "--disable-interactivity".into(),
                ];
                if spec.silent.unwrap_or(false) {
                    args.push("-h".into());
                }
                let cmd_line = format!("winget {}", args.join(" "));
                let label = spec
                    .display
                    .clone()
                    .unwrap_or_else(|| "一键更新全部".into());
                return Ok((Prepared::Cmd(process::winget_cmd(&args), cmd_line), label));
            }
            let id = spec.winget_id.clone().ok_or("缺少 wingetId")?;
            let args = winget_action_args(&action, &id, spec.silent.unwrap_or(false), spec.location.as_deref())?;
            let cmd_line = format!("winget {}", args.join(" "));
            let label = spec
                .display
                .clone()
                .unwrap_or_else(|| format!("{action} {id}"));
            Ok((Prepared::Cmd(process::winget_cmd(&args), cmd_line), label))
        }
        "process" => {
            let program = spec.program.clone().ok_or("缺少 program")?;
            let args = spec.args.clone().unwrap_or_default();
            let extra = spec.path_extra.clone().unwrap_or_default();
            let (cmd, resolved) =
                tools::tool_command(&program, &args, &extra, &HashMap::new(), false);
            let cmd_line = format!("{resolved} {}", args.join(" "));
            let label = spec
                .display
                .clone()
                .unwrap_or_else(|| format!("{program} {}", args.join(" ")));
            Ok((Prepared::Cmd(cmd, cmd_line), label))
        }
        other => Err(format!("未知任务类型：{other}")),
    }
}

// ---------- 任务引擎（队列） ----------
//
// winget 客户端自带安装锁（官方 issue #6138 Not planned、并行 spec #6295 仍是草案），
// 同一时刻只能跑一个安装/更新 —— 但用户不该因此干等：
// 我们把任务排成队列依次执行，只读操作（搜索/快照刷新）不受影响。

#[derive(Default)]
struct Engine {
    queue: std::collections::VecDeque<(String, TaskSpec)>,
    running: Option<String>,
    child: Option<ChildSlot>,
}

/// 当前运行任务的子进程槽位（重试时会被替换；取消操作经它 kill）
type ChildSlot = Arc<Mutex<Option<Arc<Mutex<Child>>>>>;

#[derive(Default)]
struct AppState(Mutex<Engine>, Mutex<Option<activity::ActivitySession>>);

/// 队列上限：超出的提交直接拒绝（前端同步禁用按钮）。
const MAX_QUEUE: usize = 8;

/// 事件合并窗口：winget 进度条用 `\r` 高频刷新，逐段转发会打爆 IPC。
const FLUSH_INTERVAL: Duration = Duration::from_millis(80);

// ---------- 查询命令 ----------

#[tauri::command]
async fn winget_available() -> bool {
    tauri::async_runtime::spawn_blocking(|| {
        process::run_capture(&["--version".to_string()])
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false)
    })
    .await
    .unwrap_or(false)
}

const SEARCH_TTL: u64 = 24 * 3600;
const DETAIL_TTL: u64 = 24 * 3600;
const GH_TTL: u64 = 6 * 3600;

#[tauri::command]
async fn search_apps(query: String) -> Result<Vec<AppInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let key = format!("search:{}", query.to_lowercase());
        if let Some(cached) = index_db::kv_get(&key, SEARCH_TTL) {
            if let Ok(v) = serde_json::from_str::<Vec<AppInfo2>>(&cached) {
                return Ok(v.into_iter().map(Into::into).collect());
            }
        }
        let args = vec![
            "search".into(),
            query,
            "--source".into(),
            "winget".into(),
            "--accept-source-agreements".into(),
            "--disable-interactivity".into(),
            "-n".into(),
            "100".into(),
        ];
        let out = process::run_capture(&args)?;
        let rows: Vec<AppInfo> = table::parse_search(&out)
            .into_iter()
            .map(|r| AppInfo {
                name: r.name,
                id: r.id,
                version: r.version,
            })
            .collect();
        if let Ok(json) = serde_json::to_string(&rows2(&rows)) {
            index_db::kv_set(&key, &json);
        }
        Ok(rows)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 可序列化的镜像（AppInfo 缺 Deserialize，缓存走它）
#[derive(Serialize, Deserialize)]
struct AppInfo2 {
    name: String,
    id: String,
    version: String,
}

impl From<AppInfo2> for AppInfo {
    fn from(v: AppInfo2) -> Self {
        AppInfo {
            name: v.name,
            id: v.id,
            version: v.version,
        }
    }
}

fn rows2(rows: &[AppInfo]) -> Vec<AppInfo2> {
    rows.iter()
        .map(|r| AppInfo2 {
            name: r.name.clone(),
            id: r.id.clone(),
            version: r.version.clone(),
        })
        .collect()
}

#[tauri::command]
async fn app_detail(id: String) -> Result<AppDetail, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let key = format!("detail:{}", id.to_lowercase());
        if let Some(cached) = index_db::kv_get(&key, DETAIL_TTL) {
            if let Ok(d) = serde_json::from_str::<AppDetail>(&cached) {
                return Ok(d);
            }
        }
        let args = vec![
            "show".into(),
            "-e".into(),
            "--id".into(),
            id.clone(),
            "--source".into(),
            "winget".into(),
            "--accept-source-agreements".into(),
            "--disable-interactivity".into(),
        ];
        let out = process::run_capture(&args)?;
        let s = table::parse_show(&out);
        let d = AppDetail {
            id: s.id,
            name: s.name,
            version: s.version,
            publisher: s.publisher,
            homepage: s.homepage,
            description: s.description,
            urls: s.urls,
        };
        if let Ok(json) = serde_json::to_string(&d) {
            index_db::kv_set(&key, &json);
        }
        Ok(d)
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------- 快照（SQLite 缓存索引） ----------

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotDto {
    pub installed: Vec<AppInfo>,
    pub upgrades: Vec<UpgradeInfo>,
    pub installed_at: u64,
    pub upgrades_at: u64,
}

/// 快照 TTL：超过即视为陈旧，启动时后台重跑。
const SNAPSHOT_TTL: u64 = 600;

fn snapshot_from_db() -> Result<SnapshotDto, String> {
    let ((inst, inst_at), (ups, ups_at)) = index_db::read_snapshot()?;
    Ok(SnapshotDto {
        installed: inst
            .into_iter()
            .map(|r| AppInfo {
                name: r.name,
                id: r.id,
                version: r.version,
            })
            .collect(),
        upgrades: ups
            .into_iter()
            .filter_map(|r| {
                r.available.map(|available| UpgradeInfo {
                    name: r.name,
                    id: r.id,
                    version: r.version,
                    available,
                })
            })
            .collect(),
        installed_at: inst_at,
        upgrades_at: ups_at,
    })
}

/// 只读库（毫秒级）：界面先拿这个渲染。
#[tauri::command]
async fn snapshot_load() -> Result<SnapshotDto, String> {
    tauri::async_runtime::spawn_blocking(snapshot_from_db)
        .await
        .map_err(|e| e.to_string())?
}

/// 后台刷新：跑一遍 winget list/upgrade → 落库 → 返回新快照。
/// force=false 且快照未过期时直接回库值（不打扰 winget）。
#[tauri::command]
async fn snapshot_refresh(force: bool) -> Result<SnapshotDto, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let stale = match index_db::read_snapshot() {
            Ok(((inst, inst_at), (_, ups_at))) => {
                let now = index_db::now();
                inst.is_empty()
                    || inst_at == 0
                    || now.saturating_sub(inst_at) > SNAPSHOT_TTL
                    || ups_at == 0
                    || now.saturating_sub(ups_at) > SNAPSHOT_TTL
            }
            Err(_) => true,
        };
        if force || stale {
            // list / upgrade 均为只读查询，并行跑（各需数秒），刷新耗时减半
            // 容错：任一命令失败（源抽风/限流）只丢对应部分，成功的照样落库——
            // 不能整单丢弃，否则「装完界面不同步」
            let inst_handle = std::thread::spawn(|| {
                process::run_capture(&[
                    "list".into(),
                    "--source".into(),
                    "winget".into(),
                    "--accept-source-agreements".into(),
                    "--disable-interactivity".into(),
                ])
            });
            let ups_handle = std::thread::spawn(|| {
                process::run_capture(&[
                    "upgrade".into(),
                    "--source".into(),
                    "winget".into(),
                    "--accept-source-agreements".into(),
                    "--disable-interactivity".into(),
                ])
            });
            let inst_out = inst_handle.join().ok().and_then(|r| r.ok());
            let ups_out = ups_handle.join().ok().and_then(|r| r.ok());
            if inst_out.is_none() && ups_out.is_none() {
                return Err("winget list/upgrade 均失败".to_string());
            }

            if let Some(out) = inst_out {
                let inst: Vec<index_db::AppRow> = table::parse_list(&out)
                    .into_iter()
                    .map(|r| index_db::AppRow {
                        id: r.id,
                        name: r.name,
                        version: r.version,
                        available: None,
                    })
                    .collect();
                index_db::write_kind("installed", &inst)?;
            }

            if let Some(out) = ups_out {
                let ups: Vec<index_db::AppRow> = table::parse_upgrade(&out)
                    .into_iter()
                    .map(|r| index_db::AppRow {
                        id: r.id,
                        name: r.name,
                        version: r.version,
                        available: r.extra,
                    })
                    .collect();
                index_db::write_kind("upgrade", &ups)?;
            }
        }
        snapshot_from_db()
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn github_release(repo: String) -> Result<gh::GhRelease, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let key = format!("gh:{}", repo.to_lowercase());
        if let Some(cached) = index_db::kv_get(&key, GH_TTL) {
            if let Ok(r) = serde_json::from_str::<gh::GhRelease>(&cached) {
                return Ok(r);
            }
        }
        let r = gh::fetch_latest(&repo)?;
        if let Ok(json) = serde_json::to_string(&r) {
            index_db::kv_set(&key, &json);
        }
        Ok(r)
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------- 工具链 / 环境变量 / 镜像 ----------

#[tauri::command]
async fn check_tools(names: Vec<String>) -> Vec<ToolStatusDto> {
    tauri::async_runtime::spawn_blocking(move || {
        tools::check_tools(&names)
            .into_iter()
            .map(|t| ToolStatusDto {
                name: t.name,
                installed: t.installed,
                path: t.path,
                version: t.version,
            })
            .collect()
    })
    .await
    .unwrap_or_default()
}

#[tauri::command]
async fn get_user_envs(names: Vec<String>) -> HashMap<String, String> {
    tauri::async_runtime::spawn_blocking(move || tools::get_user_envs(&names))
        .await
        .unwrap_or_default()
}

#[tauri::command]
async fn set_user_env(name: String, value: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || tools::set_user_env(&name, &value))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn mirror_status(tools_list: Vec<String>) -> Vec<MirrorStatusDto> {
    tauri::async_runtime::spawn_blocking(move || {
        mirror::detect_all(&tools_list)
            .into_iter()
            .map(|m| MirrorStatusDto {
                tool: m.tool,
                installed: m.installed,
                current: m.current,
            })
            .collect()
    })
    .await
    .unwrap_or_default()
}

#[tauri::command]
async fn mirror_apply(tool: String, value: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || mirror::apply_one(&tool, &value))
        .await
        .map_err(|e| e.to_string())?
}

// ---------- 启动智能体（独立控制台窗口） ----------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchSpec {
    program: String,
    args: Option<Vec<String>>,
    env: Option<HashMap<String, String>>,
    path_extra: Option<Vec<String>>,
}

#[tauri::command]
fn launch_agent(spec: LaunchSpec) -> Result<(), String> {
    let args = spec.args.unwrap_or_default();
    let env = spec.env.unwrap_or_default();
    let extra = spec.path_extra.unwrap_or_default();
    let (mut cmd, _) = tools::tool_command(&spec.program, &args, &extra, &env, true);
    cmd.spawn()
        .map_err(|e| format!("启动失败：{e}（请确认已完成安装步骤）"))?;
    // 分离运行：不等待、不持有，让智能体在自己的控制台窗口里跑
    Ok(())
}

// ---------- GitHub CLI 状态 ----------

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GhCliStatus {
    pub installed: bool,
    pub authed: bool,
}

#[tauri::command]
async fn gh_cli_status() -> GhCliStatus {
    tauri::async_runtime::spawn_blocking(|| {
        let (installed, authed) = gh::gh_cli_status();
        GhCliStatus { installed, authed }
    })
    .await
    .unwrap_or(GhCliStatus {
        installed: false,
        authed: false,
    })
}

// ---------- 更新日志（winget 远程索引的 ReleaseNotes / ReleaseNotesUrl） ----------

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NotesDto {
    pub id: String,
    pub notes: String,
    pub url: String,
    pub source: String,
}

const NOTES_TTL: u64 = 24 * 3600;
/// 预取上限：每轮最多为 20 个应用拉日志（winget show 是本地进程，无 API 限制）
const PREFETCH_MAX: usize = 20;

fn fetch_notes(id: &str) -> Result<NotesDto, String> {
    let key = format!("notes:{}", id.to_lowercase());
    if let Some(c) = index_db::kv_get(&key, NOTES_TTL) {
        if let Ok(d) = serde_json::from_str::<NotesDto>(&c) {
            return Ok(d);
        }
    }
    let out = process::run_capture(&[
        "show".into(),
        "-e".into(),
        "--id".into(),
        id.to_string(),
        "--source".into(),
        "winget".into(),
        "--accept-source-agreements".into(),
        "--disable-interactivity".into(),
    ])?;
    let s = table::parse_show(&out);
    let d = NotesDto {
        id: id.to_string(),
        notes: s.release_notes,
        url: s.release_notes_url,
        source: "winget".into(),
    };
    if let Ok(j) = serde_json::to_string(&d) {
        index_db::kv_set(&key, &j);
    }
    Ok(d)
}

#[tauri::command]
async fn release_notes(id: String) -> Result<NotesDto, String> {
    tauri::async_runtime::spawn_blocking(move || fetch_notes(&id))
        .await
        .map_err(|e| e.to_string())?
}

/// 后台预取（快照刷新后由前端触发）：跳过已缓存的，逐条 winget show 落 SQLite。
#[tauri::command]
fn prefetch_release_notes(ids: Vec<String>) -> usize {
    let todo: Vec<String> = ids
        .into_iter()
        .take(PREFETCH_MAX)
        .filter(|id| index_db::kv_get(&format!("notes:{}", id.to_lowercase()), NOTES_TTL).is_none())
        .collect();
    let n = todo.len();
    if n > 0 {
        std::thread::spawn(move || {
            for id in todo {
                let _ = fetch_notes(&id);
            }
        });
    }
    n
}

// ---------- 文件活动监控 ----------

#[tauri::command]
fn activity_start(app: AppHandle, state: State<AppState>, roots: Vec<String>) -> Result<(), String> {
    let session = activity::start(app, roots)?;
    let mut guard = state.1.lock().map_err(|e| e.to_string())?;
    activity::stop(guard.take()); // 旧会话先停
    *guard = Some(session);
    Ok(())
}

#[tauri::command]
fn activity_stop(state: State<AppState>) -> bool {
    if let Ok(mut guard) = state.1.lock() {
        let had = guard.is_some();
        activity::stop(guard.take());
        return had;
    }
    false
}

#[tauri::command]
fn activity_status(state: State<AppState>) -> bool {
    state.1.lock().map(|g| g.is_some()).unwrap_or(false)
}

#[tauri::command]
async fn activity_processes() -> Vec<activity::ProcDto> {
    tauri::async_runtime::spawn_blocking(activity::processes)
        .await
        .unwrap_or_default()
}

// ---------- 缓存清理 ----------

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CleanupItemDto {
    pub name: String,
    pub size: u64,
    pub files: u32,
    pub modified: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CleanupInfoDto {
    pub dir: String,
    pub total_bytes: u64,
    pub file_count: u32,
    pub dir_count: u32,
    pub items: Vec<CleanupItemDto>,
    pub winget_running: bool,
    /// 本应用任务引擎是否有任务进行中（此时禁止清理）
    pub task_running: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CleanupResultDto {
    pub freed_bytes: u64,
    pub deleted: u32,
    pub skipped: u32,
}

#[tauri::command]
async fn cleanup_scan(state: State<'_, AppState>) -> Result<CleanupInfoDto, String> {
    let task_running = state.0.lock().map(|e| e.running.is_some()).unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || {
        let info = cleanup::scan()?;
        Ok(CleanupInfoDto {
            dir: info.dir,
            total_bytes: info.total_bytes,
            file_count: info.file_count,
            dir_count: info.dir_count,
            items: info
                .items
                .into_iter()
                .map(|i| CleanupItemDto {
                    name: i.name,
                    size: i.size,
                    files: i.files,
                    modified: i.modified,
                })
                .collect(),
            winget_running: info.winget_running,
            task_running,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn cleanup_run(state: State<'_, AppState>) -> Result<CleanupResultDto, String> {
    let task_running = state.0.lock().map(|e| e.running.is_some()).unwrap_or(false);
    if task_running {
        return Err("本应用有安装任务进行中，完成后再清理".into());
    }
    tauri::async_runtime::spawn_blocking(|| {
        let r = cleanup::clean()?;
        Ok(CleanupResultDto {
            freed_bytes: r.freed_bytes,
            deleted: r.deleted,
            skipped: r.skipped,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------- 深度卸载残留（Geek Uninstaller 式） ----------

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LeftoverRegistryDto {
    pub key: String,
    pub name: String,
    pub kind: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LeftoverDirDto {
    pub path: String,
    pub size: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LeftoverReportDto {
    pub registry: Vec<LeftoverRegistryDto>,
    pub dirs: Vec<LeftoverDirDto>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CleanReportDto {
    pub freed_bytes: u64,
    pub dirs_deleted: u32,
    pub dirs_skipped: u32,
    pub keys_deleted: u32,
    pub keys_skipped: u32,
}

#[tauri::command]
async fn leftover_scan(id: String, name: String) -> LeftoverReportDto {
    tauri::async_runtime::spawn_blocking(move || {
        let r = leftover::scan(&id, &name);
        LeftoverReportDto {
            registry: r
                .registry
                .into_iter()
                .map(|x| LeftoverRegistryDto {
                    key: x.key,
                    name: x.name,
                    kind: x.kind,
                })
                .collect(),
            dirs: r
                .dirs
                .into_iter()
                .map(|x| LeftoverDirDto {
                    path: x.path,
                    size: x.size,
                })
                .collect(),
        }
    })
    .await
    .unwrap_or_default()
}

impl Default for LeftoverReportDto {
    fn default() -> Self {
        Self {
            registry: vec![],
            dirs: vec![],
        }
    }
}

#[tauri::command]
async fn leftover_clean(dirs: Vec<String>, keys: Vec<String>) -> Result<CleanReportDto, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let r = leftover::clean(&dirs, &keys);
        Ok(CleanReportDto {
            freed_bytes: r.freed_bytes,
            dirs_deleted: r.dirs_deleted,
            dirs_skipped: r.dirs_skipped,
            keys_deleted: r.keys_deleted,
            keys_skipped: r.keys_skipped,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------- 任务（winget / 进程，队列调度 + 流式输出） ----------

/// 队列有位置就尝试启动下一个任务（调用时必须已持有 engine 锁）。
fn schedule_next(app: &AppHandle, engine: &mut Engine) {
    if engine.running.is_some() {
        return;
    }
    let Some((id, spec)) = engine.queue.pop_front() else {
        return;
    };
    let spawned = (|| -> Result<_, String> {
        let (prepared, label) = spec_command(&spec)?;
        Ok((prepared, label))
    })();
    let (prepared, label) = match spawned {
        Ok(v) => v,
        Err(e) => {
            let _ = app.emit(
                "task-done",
                TaskDone {
                    id,
                    code: -1,
                    success: false,
                    error_tail: vec![e],
                },
            );
            return schedule_next(app, engine);
        }
    };
    let cmd_line = match &prepared {
        Prepared::Cmd(_, line) => line.clone(),
        Prepared::Download { url, .. } => format!("下载 {url}"),
    };
    let slot: ChildSlot = Arc::new(Mutex::new(None));
    engine.running = Some(id.clone());
    engine.child = Some(slot.clone());
    let _ = app.emit(
        "task-started",
        TaskStarted {
            id: id.clone(),
            label,
            command: cmd_line,
        },
    );

    let app2 = app.clone();
    std::thread::spawn(move || stream_task(app2, id, spec, prepared, slot));
}

// ---------- 下载看门狗：超时 / 停滞 / 过慢 → 自动切镜像重试 ----------
//
// winget 官方源（cdn.winget.microsoft.com）在国内可能极慢。
// 策略：只读管道是阻塞的，所以用独立看门狗线程每 2s 检查一次共享状态：
// - 下载阶段（已见进度且 <100%）180s 无任何输出 → 停滞
// - 下载阶段 15s 窗口内平均速度 < 50 KB/s → 过慢
// - 任务总时长 > 30 分钟 → 硬超时（不重试）
// 停滞/过慢且任务是 winget 安装/更新 → 杀进程、切 USTC 镜像源、原样重试一次。

const STALL_SECS: u64 = 180;
const SLOW_BPS: u64 = 50 * 1024;
const SPEED_WINDOW: std::time::Duration = Duration::from_secs(15);
const HARD_TIMEOUT: std::time::Duration = Duration::from_secs(30 * 60);
const USTC_SOURCE: &str = "https://mirrors.ustc.edu.cn/winget-source";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SlowReason {
    Stall,
    Slow(u64),
    Timeout,
}

struct WatchState {
    started: Instant,
    last_output: Instant,
    pct: Option<u8>,
    /// (时间, 已下载字节) 采样，窗口外的随时清掉
    samples: std::collections::VecDeque<(Instant, u64)>,
    decision: Option<SlowReason>,
    done: bool,
}

impl WatchState {
    fn new() -> Self {
        Self {
            started: Instant::now(),
            last_output: Instant::now(),
            pct: None,
            samples: std::collections::VecDeque::new(),
            decision: None,
            done: false,
        }
    }
}

fn watchdog(watch: Arc<Mutex<WatchState>>, child: Arc<Mutex<Child>>) {
    loop {
        std::thread::sleep(Duration::from_secs(2));
        let mut kill = false;
        {
            let mut w = watch.lock().unwrap();
            if w.done {
                return;
            }
            if w.decision.is_none() {
                if w.started.elapsed() > HARD_TIMEOUT {
                    w.decision = Some(SlowReason::Timeout);
                } else {
                    let downloading = w.pct.is_some_and(|p| p < 100) && !w.samples.is_empty();
                    if downloading {
                        if w.last_output.elapsed() > Duration::from_secs(STALL_SECS) {
                            w.decision = Some(SlowReason::Stall);
                        } else {
                            let cutoff = Instant::now() - SPEED_WINDOW;
                            while w
                                .samples
                                .front()
                                .is_some_and(|(t, _)| *t < cutoff)
                            {
                                w.samples.pop_front();
                            }
                            if w.samples.len() >= 2 {
                                let (t0, b0) = *w.samples.front().unwrap();
                                let (t1, b1) = *w.samples.back().unwrap();
                                let span = t1.duration_since(t0);
                                if span >= Duration::from_secs(12) {
                                    let bps = b1.saturating_sub(b0) / span.as_secs().max(1);
                                    if bps < SLOW_BPS {
                                        w.decision = Some(SlowReason::Slow(bps));
                                    }
                                }
                            }
                        }
                    }
                }
                kill = w.decision.is_some();
            }
        }
        if kill {
            if let Ok(mut c) = child.lock() {
                let _ = c.kill();
            }
            return;
        }
    }
}

// ---------- 官网直链下载安装（download 任务） ----------

/// 流式下载到临时目录，逐块回调（已下载字节, 总字节）。
fn http_download(url: &str, dest: &std::path::Path, mut on: impl FnMut(u64, Option<u64>)) -> Result<(), String> {
    use std::io::Read;
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(60 * 30)))
        .user_agent("tongtop-store/0.2")
        .build()
        .into();
    let mut resp = agent.get(url).call().map_err(|e| match e {
        ureq::Error::StatusCode(code) => format!("下载链接返回 {code}"),
        other => format!("无法连接：{other}"),
    })?;
    let total: Option<u64> = resp
        .headers()
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse().ok());
    if let Some(dir) = dest.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let mut file = std::fs::File::create(dest).map_err(|e| format!("无法写入临时文件：{e}"))?;
    let mut reader = resp.body_mut().as_reader();
    let mut buf = [0u8; 65536];
    let mut got: u64 = 0;
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                use std::io::Write;
                file.write_all(&buf[..n]).map_err(|e| format!("写入失败：{e}"))?;
                got += n as u64;
                on(got, total);
            }
            Err(e) => return Err(format!("下载中断：{e}")),
        }
    }
    Ok(())
}

fn url_filename(url: &str) -> String {
    let tail = url.rsplit('/').next().unwrap_or("installer.exe");
    let clean = tail.split(['?', '#']).next().unwrap_or(tail);
    let clean: String = clean
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
        .collect();
    if clean.is_empty() {
        "installer.exe".into()
    } else {
        clean
    }
}

/// 下载安装包到 %TEMP%\tongtop-dl（进度走 task-log 事件），返回落盘路径。
fn download_installer(app: &AppHandle, id: &str, url: &str) -> Result<std::path::PathBuf, String> {
    let dest = std::env::temp_dir()
        .join("tongtop-dl")
        .join(url_filename(url));
    emit_lines(app, id, vec![format!("开始下载：{url}")]);
    let mut last_pct = 0u64;
    let mut last_emit = Instant::now();
    http_download(url, &dest, |got, total| {
        if let Some(t) = total.filter(|t| *t > 0) {
            let pct = (got * 100 / t).min(100) as u8;
            let due = last_emit.elapsed() >= Duration::from_millis(200);
            if due {
                last_emit = Instant::now();
                let _ = app.emit(
                    "task-log",
                    TaskLog {
                        id: id.to_string(),
                        lines: vec![],
                        progress: Some(pct),
                    },
                );
            }
            // 每 25% 补一行文字日志，面板不空
            let mark = pct as u64 / 25;
            if mark > last_pct / 25 {
                last_pct = pct as u64;
                emit_lines(
                    app,
                    id,
                    vec![format!("已下载 {:.1} MB / {:.1} MB", got as f64 / 1e6, t as f64 / 1e6)],
                );
            }
        }
    })?;
    emit_lines(app, id, vec!["下载完成，开始安装…".into()]);
    Ok(dest)
}

/// 安装包执行命令：msi 走 msiexec 静默，exe 用调用方给的静默参数（无则交互式）。
fn installer_command(file: &std::path::Path, args: &[String]) -> std::process::Command {
    if file.extension().is_some_and(|e| e == "msi") {
        let mut c = std::process::Command::new("msiexec.exe");
        c.arg("/i").arg(file);
        if args.is_empty() {
            c.arg("/qn");
        } else {
            c.args(args);
        }
        c
    } else {
        let mut c = std::process::Command::new(file);
        c.args(args);
        c
    }
}

struct RunOutcome {
    code: i32,
    decision: Option<SlowReason>,
    stderr_tail: Vec<String>,
}

/// 跑一遍命令：流式输出 + 看门狗监控。
fn run_once(
    app: &AppHandle,
    id: &str,
    mut cmd: std::process::Command,
    slot: &ChildSlot,
) -> Result<RunOutcome, String> {
    let mut child = cmd.spawn().map_err(|e| format!("无法启动：{e}"))?;
    let mut stdout = child.stdout.take().ok_or("无法读取输出")?;
    let mut stderr = child.stderr.take();
    let child = Arc::new(Mutex::new(child));
    *slot.lock().unwrap() = Some(child.clone());

    let watch = Arc::new(Mutex::new(WatchState::new()));
    let wd = {
        let watch = watch.clone();
        let child = child.clone();
        std::thread::spawn(move || watchdog(watch, child))
    };

    let stderr_handle = stderr.take().map(|mut err| {
        std::thread::spawn(move || {
            let mut all = Vec::new();
            let _ = std::io::Read::read_to_end(&mut err, &mut all);
            let text = process::decode(&all);
            text.lines()
                .map(|l| l.trim().to_string())
                .filter(|l| !l.is_empty())
                .collect::<Vec<_>>()
        })
    });

    let mut pending: Vec<u8> = Vec::new();
    let mut batch: Vec<String> = Vec::new();
    let mut last_flush = Instant::now();
    let mut buf = [0u8; 8192];
    let mut progress: Option<u8> = None;

    loop {
        match std::io::Read::read(&mut stdout, &mut buf) {
            Ok(0) => break,
            Ok(n) => {
                let mut segs = Vec::new();
                process::split_segments(&mut pending, &buf[..n], &mut segs);
                {
                    let mut w = watch.lock().unwrap();
                    w.last_output = Instant::now();
                    for s in &segs {
                        if let Some(d) = process::parse_download(s) {
                            w.samples.push_back((Instant::now(), d.done));
                            w.pct = Some(d.pct);
                        } else if let Some(p) = process::parse_progress(s) {
                            w.pct = Some(p);
                        }
                    }
                }
                for s in segs {
                    if let Some(p) = process::parse_progress(&s) {
                        progress = Some(p);
                    }
                    let t = s.trim();
                    if !t.is_empty() {
                        batch.push(t.to_string());
                    }
                }
                let due = last_flush.elapsed() >= FLUSH_INTERVAL;
                if due && (!batch.is_empty() || progress.is_some()) {
                    let _ = app.emit(
                        "task-log",
                        TaskLog {
                            id: id.to_string(),
                            lines: std::mem::take(&mut batch),
                            progress,
                        },
                    );
                    last_flush = Instant::now();
                }
            }
            Err(_) => break,
        }
    }
    if !pending.is_empty() {
        let t = process::decode(&pending);
        let t = t.trim();
        if !t.is_empty() {
            batch.push(t.to_string());
        }
    }
    if !batch.is_empty() || progress.is_some() {
        let _ = app.emit(
            "task-log",
            TaskLog {
                id: id.to_string(),
                lines: batch,
                progress,
            },
        );
    }
    let mut stderr_tail = Vec::new();
    if let Some(h) = stderr_handle {
        if let Ok(lines) = h.join() {
            let keep = 20;
            stderr_tail = lines.into_iter().rev().take(keep).collect::<Vec<_>>();
            stderr_tail.reverse();
        }
    }
    let status = child
        .lock()
        .map_err(|e| e.to_string())
        .and_then(|mut c| c.wait().map_err(|e| e.to_string()));
    let code = status.ok().and_then(|s| s.code()).unwrap_or(-1);
    *slot.lock().unwrap() = None;
    let decision = {
        let mut w = watch.lock().unwrap();
        w.done = true;
        w.decision
    };
    let _ = wd.join();
    Ok(RunOutcome {
        code,
        decision,
        stderr_tail,
    })
}

fn stream_task(
    app: AppHandle,
    id: String,
    spec: TaskSpec,
    prepared: Prepared,
    slot: ChildSlot,
) {
    // download 任务：先下载安装包，再构造安装命令
    let cmd = match prepared {
        Prepared::Cmd(cmd, _) => cmd,
        Prepared::Download { url, args } => match download_installer(&app, &id, &url) {
            Ok(file) => installer_command(&file, &args),
            Err(e) => {
                let _ = app.emit(
                    "task-done",
                    TaskDone {
                        id: id.clone(),
                        code: -1,
                        success: false,
                        error_tail: vec![e],
                    },
                );
                let st = app.state::<AppState>();
                if let Ok(mut engine) = st.0.lock() {
                    engine.running = None;
                    engine.child = None;
                    schedule_next(&app, &mut engine);
                }
                return;
            }
        },
    };

    let retryable = spec.kind == "winget"
        && matches!(
            spec.action.as_deref(),
            Some("install") | Some("upgrade") | Some("upgrade_all")
        );

    let mut outcome = match run_once(&app, &id, cmd, &slot) {
        Ok(o) => o,
        Err(e) => RunOutcome {
            code: -1,
            decision: None,
            stderr_tail: vec![e],
        },
    };

    // 官方源停滞/过慢 → 切中科大镜像源，原样重试一次（竞态：已成功则不重试）
    if retryable
        && outcome.code != 0
        && matches!(outcome.decision, Some(SlowReason::Stall) | Some(SlowReason::Slow(_)))
    {
        let why = match outcome.decision {
            Some(SlowReason::Stall) => format!("下载停滞超过 {STALL_SECS} 秒"),
            Some(SlowReason::Slow(bps)) => format!("下载速度仅 {} KB/s", bps / 1024),
            _ => String::new(),
        };
        emit_lines(&app, &id, vec![format!("官方源{why}，正在切换中科大镜像源重试…")]);
        match mirror::apply_one("winget", USTC_SOURCE) {
            Ok(_) => {
                index_db::kv_set("mirror:auto_switched", &index_db::now().to_string());
                emit_lines(&app, &id, vec!["已切换为 USTC 镜像源，重新开始下载…".into()]);
                if let Ok((Prepared::Cmd(cmd2, _), _)) = spec_command(&spec) {
                    match run_once(&app, &id, cmd2, &slot) {
                        Ok(o2) => {
                            if o2.code == 0 {
                                emit_lines(&app, &id, vec!["镜像源重试成功。".into()]);
                            }
                            outcome = o2;
                        }
                        Err(e) => {
                            outcome.stderr_tail.push(e);
                        }
                    }
                }
            }
            Err(e) => {
                emit_lines(&app, &id, vec![format!("镜像源切换失败（{e}），以官方源结果为准。")]);
            }
        }
    }
    if matches!(outcome.decision, Some(SlowReason::Timeout)) {
        emit_lines(&app, &id, vec!["任务超过 30 分钟，已强制终止。".into()]);
    }

    let code = outcome.code;
    let _ = app.emit(
        "task-done",
        TaskDone {
            id: id.clone(),
            code,
            success: code == 0,
            error_tail: outcome.stderr_tail,
        },
    );
    // 清理自己，调度下一个
    let st = app.state::<AppState>();
    if let Ok(mut engine) = st.0.lock() {
        engine.running = None;
        engine.child = None;
        schedule_next(&app, &mut engine);
    };
}

fn emit_lines(app: &AppHandle, id: &str, lines: Vec<String>) {
    let _ = app.emit(
        "task-log",
        TaskLog {
            id: id.to_string(),
            lines,
            progress: None,
        },
    );
}

#[tauri::command]
fn start_task(app: AppHandle, state: State<AppState>, id: String, spec: TaskSpec) -> Result<(), String> {
    let mut engine = state.0.lock().map_err(|e| e.to_string())?;
    if engine.running.as_deref() == Some(id.as_str())
        || engine.queue.iter().any(|(qid, _)| qid == &id)
    {
        return Err("该任务已在队列中".into());
    }
    if engine.running.is_some() && engine.queue.len() >= MAX_QUEUE {
        return Err(format!("队列已满（{MAX_QUEUE}），请稍后再试"));
    }
    engine.queue.push_back((id.clone(), spec.clone()));
    let label = spec.display.clone().unwrap_or_else(|| id.clone());
    let _ = app.emit("task-queued", TaskQueued { id, label });
    schedule_next(&app, &mut engine);
    Ok(())
}

#[tauri::command]
fn cancel_task(app: AppHandle, state: State<AppState>, id: String) -> bool {
    let Ok(mut engine) = state.0.lock() else {
        return false;
    };
    if engine.running.as_deref() == Some(id.as_str()) {
        if let Some(slot) = &engine.child {
            if let Some(c) = slot.lock().unwrap().as_ref() {
                if let Ok(mut ch) = c.lock() {
                    return ch.kill().is_ok();
                }
            }
        }
        false
    } else {
        let before = engine.queue.len();
        engine.queue.retain(|(qid, _)| qid != &id);
        if engine.queue.len() < before {
            let _ = app.emit(
                "task-done",
                TaskDone {
                    id,
                    code: -2,
                    success: false,
                    error_tail: vec!["已从队列取消".into()],
                },
            );
            true
        } else {
            false
        }
    }
}

// ---------- 自更新（自家 GitHub Releases 发布渠道） ----------

/// 商店自身的发布仓库（GitHub Releases 里的 NSIS 安装包即更新源）
const SELF_REPO: &str = "hencter/tongtop-store";

/// semver 比较：a > b ?（按 主.次.修订 数值段，正式版优先于预发布）
fn semver_gt(a: &str, b: &str) -> bool {
    fn parts(s: &str) -> (Vec<u64>, String) {
        let s = s.trim().trim_start_matches('v');
        let (core, pre) = s.split_once('-').unwrap_or((s, ""));
        (
            core.split('.').map(|p| p.parse().unwrap_or(0)).collect(),
            pre.to_string(),
        )
    }
    let (ac, ap) = parts(a);
    let (bc, bp) = parts(b);
    for i in 0..3 {
        let (x, y) = (ac.get(i).copied().unwrap_or(0), bc.get(i).copied().unwrap_or(0));
        if x != y {
            return x > y;
        }
    }
    match (ap.is_empty(), bp.is_empty()) {
        (true, false) => true,
        (false, true) => false,
        _ => ap > bp,
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SelfUpdateInfo {
    current: String,
    latest: String,
    notes: String,
    release_url: String,
    asset_url: String,
    asset_size: u64,
    has_update: bool,
    /// 安装包 sha256（来自同 Release 的 .sha256 资产；老版本没有则为空）
    expected_sha256: Option<String>,
    /// minisign 签名（来自同 Release 的 .sig 资产；有则优先于 sha256 验签）
    signature: Option<String>,
    /// 更新资产形态："exe"（裸 exe，看门狗 Copy 覆盖）| "nsis"（安装器 /S，老版本回退）
    asset_kind: String,
}

/// 更新签名公钥（minisign 公钥文件文本，私钥在 CI secret；编译进应用防 Release 被替换）。
/// 注：tauri 配置里的 pubkey 是本文本再 base64 一层；此处存内层文本，直接 PublicKey::decode。
const UPDATER_PUBKEY: &str = "untrusted comment: minisign public key: 361407D7E51649E8
RWToSRbl1wcUNgDkPKGZ0k/L/OSwvm8dUkHJRN0Zjeit5RRYqU3jKtET
";

/// minisign 验签：数据 + .sig 资产内容对照内置公钥。
/// tauri signer 双层编码：.sig 文件 = base64(minisign 文本)，需先解 base64 再 decode。
fn verify_minisign(data: &[u8], signature_b64: &str) -> Result<(), String> {
    use base64::Engine;
    use minisign_verify::{PublicKey, Signature};
    let pk = PublicKey::decode(UPDATER_PUBKEY).map_err(|e| format!("内置公钥异常：{e}"))?;
    let sig_bytes = base64::engine::general_purpose::STANDARD
        .decode(signature_b64.trim())
        .map_err(|e| format!("签名 base64 异常：{e}"))?;
    let sig_text = String::from_utf8(sig_bytes).map_err(|e| format!("签名文本异常：{e}"))?;
    let sig = Signature::decode(&sig_text).map_err(|e| format!("签名格式异常：{e}"))?;
    // allow_legacy=true：兼容 tauri signer 产生的签名（含 legacy Ed25519 格式）
    pk.verify(data, &sig, true)
        .map_err(|e| format!("签名验证失败：{e}"))
}

/// 直连官方 URL 拉文本（不经任何第三方代理：完整性元数据的信任根）。
fn http_get_text(url: &str) -> Result<String, String> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(std::time::Duration::from_secs(15)))
        .user_agent("tongtop-store/0.4")
        .build()
        .into();
    let mut resp = agent
        .get(url)
        .call()
        .map_err(|e| format!("获取更新摘要失败：{e}"))?;
    resp.body_mut()
        .read_to_string()
        .map_err(|e| format!("读取摘要失败：{e}"))
}

#[tauri::command]
async fn check_self_update() -> Result<SelfUpdateInfo, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let key = format!("gh:{}", SELF_REPO.to_lowercase());
        let cached = index_db::kv_get(&key, GH_TTL)
            .and_then(|c| serde_json::from_str::<gh::GhRelease>(&c).ok());
        let r = match cached {
            Some(r) => r,
            None => {
                let r = gh::fetch_latest(SELF_REPO)?;
                if let Ok(json) = serde_json::to_string(&r) {
                    index_db::kv_set(&key, &json);
                }
                r
            }
        };
        let current = env!("CARGO_PKG_VERSION").to_string();
        let latest = r.tag.trim_start_matches('v').to_string();
        // 更新资产优先级：裸 exe（自有更新机制，Copy 覆盖）> NSIS 固定名 > 首个 setup.exe。
        // 老版本 Release 没有裸 exe 资产时回退 NSIS 链路。
        const EXE_ASSET: &str = "tongtop-store.exe";
        const NSIS_ASSET: &str = "tongtop-store-setup.exe";
        let (asset_url, asset_size, asset_kind, asset_name) =
            if let Some(a) = r.assets.iter().find(|a| a.name == EXE_ASSET) {
                (
                    format!("https://github.com/{SELF_REPO}/releases/latest/download/{EXE_ASSET}"),
                    a.size,
                    "exe",
                    EXE_ASSET.to_string(),
                )
            } else if let Some(a) = r.assets.iter().find(|a| a.name == NSIS_ASSET) {
                (
                    format!("https://github.com/{SELF_REPO}/releases/latest/download/{NSIS_ASSET}"),
                    a.size,
                    "nsis",
                    NSIS_ASSET.to_string(),
                )
            } else {
                let asset = r.assets.iter().find(|a| a.name.ends_with("setup.exe"));
                let name = asset.map(|a| a.name.clone()).unwrap_or_default();
                (
                    asset.map(|a| a.url.clone()).unwrap_or_default(),
                    asset.map(|a| a.size).unwrap_or(0),
                    "nsis",
                    name,
                )
            };
        // 完整性元数据（均经官方 API 资产地址直连获取，不经过任何第三方代理）：
        // minisign 签名优先（私钥在 CI，公钥编译进应用，防 Release 被整体替换）；sha256 兜底
        let signature = if asset_name.is_empty() {
            None
        } else {
            r.assets
                .iter()
                .find(|a| a.name == format!("{asset_name}.sig"))
                .and_then(|a| http_get_text(&a.url).ok())
                .filter(|t| t.contains("minisign") || t.contains("signature"))
        };
        let expected_sha256 = if asset_name.is_empty() {
            None
        } else {
            r.assets
                .iter()
                .find(|a| a.name == format!("{asset_name}.sha256"))
                .and_then(|a| http_get_text(&a.url).ok())
                .and_then(|text| text.split_whitespace().next().map(|h| h.to_lowercase()))
                .filter(|h| h.len() == 64 && h.chars().all(|c| c.is_ascii_hexdigit()))
        };
        Ok(SelfUpdateInfo {
            has_update: semver_gt(&latest, &current),
            current,
            latest,
            notes: r.body,
            release_url: r.url,
            asset_url,
            asset_size,
            expected_sha256,
            signature,
            asset_kind: asset_kind.to_string(),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 目录数据远程拉取（网站静态 JSON API：首页推荐实时更新的数据源）。
/// 原始 JSON 透传为 serde_json::Value，前端按既有类型消费（schema 与 /data 一致）。
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CatalogDto {
    apps: serde_json::Value,
    agents: serde_json::Value,
    categories: serde_json::Value,
    devtools: serde_json::Value,
    mirrors: serde_json::Value,
    updated_at: u64,
}

#[tauri::command]
async fn catalog_fetch(base: String) -> Result<CatalogDto, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let base = base.trim_end_matches('/');
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .timeout_global(Some(std::time::Duration::from_secs(12)))
            .user_agent("tongtop-store/0.4")
            .build()
            .into();
        let get = |path: &str| -> Result<serde_json::Value, String> {
            let url = format!("{base}/api/data/{path}");
            let mut resp = agent.get(&url).call().map_err(|e| match e {
                ureq::Error::StatusCode(code) => format!("{path} 返回 {code}"),
                other => format!("无法连接目录 API：{other}"),
            })?;
            let body = resp
                .body_mut()
                .read_to_string()
                .map_err(|e| format!("读取响应失败：{e}"))?;
            serde_json::from_str(&body).map_err(|e| format!("{path} 不是合法 JSON：{e}"))
        };
        let meta = get("meta.json")?;
        Ok(CatalogDto {
            apps: get("apps.json")?,
            agents: get("agents.json")?,
            categories: get("categories.json")?,
            devtools: get("devtools.json")?,
            mirrors: get("mirrors.json")?,
            updated_at: meta.get("updatedAt").and_then(|v| v.as_u64()).unwrap_or(0),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 下载新版安装包到临时目录（进度走 self-update-progress 事件），返回落盘路径。
/// 多端点容灾：官方直连优先，失败回退加速通道（完整性在 apply 阶段验签/校验，代理不可信也安全）。
/// 有预期大小时校验大小（防半截文件/错误页面）；失败清理残留。
#[tauri::command]
async fn download_self_update(
    app: AppHandle,
    url: String,
    fallback_url: Option<String>,
    expected_size: Option<u64>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dest = std::env::temp_dir()
            .join("tongtop-dl")
            .join(url_filename(&url));
        let mut last = 0u8;
        let mut attempt = |u: &str, last: &mut u8| -> Result<(), String> {
            *last = 0;
            http_download(u, &dest, |got, total| {
                if let Some(t) = total.filter(|t| *t > 0) {
                    let pct = (got * 100 / t).min(100) as u8;
                    if pct != *last {
                        *last = pct;
                        let _ = app.emit("self-update-progress", pct);
                    }
                }
            })
        };
        // 主线：官方直连
        if let Err(e1) = attempt(&url, &mut last) {
            let _ = std::fs::remove_file(&dest);
            match fallback_url.filter(|f| f.starts_with("http")) {
                Some(fb) => attempt(&fb, &mut last)
                    .map_err(|e2| format!("直连失败（{e1}）；加速通道也失败（{e2}）"))?,
                None => return Err(e1),
            }
        }
        if let Some(expect) = expected_size.filter(|s| *s > 0) {
            let actual = std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
            if actual != expect {
                let _ = std::fs::remove_file(&dest);
                return Err(format!("下载大小不符（预期 {expect}，实际 {actual}），已删除重试"));
            }
        }
        Ok(dest.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 自有更新机制看门狗：等本进程退出（文件解锁）→ 应用新资产 → 拉起新版本。
/// asset_kind="exe"：PowerShell Copy-Item 直接覆盖（自有机制，无 NSIS 版本检查/注册表错位）；
/// asset_kind="nsis"：NSIS /S 静默安装（兼容老版本 Release 的回退路径）。
/// 完整性：minisign 签名优先（公钥内置），sha256 兜底（issue #13）。
/// 成败不按退出码（NSIS 静默码不可靠），写 update-target 标记，下次启动按版本对照判定。
#[tauri::command]
fn apply_self_update(
    installer_path: String,
    expected_sha256: Option<String>,
    signature: Option<String>,
    target_version: String,
    asset_kind: String,
) -> Result<(), String> {
    let path = std::path::Path::new(&installer_path);
    if let Some(sig) = signature {
        // minisign：私钥签名 + 编译进应用的公钥验签（防下载链路与 Release 被整体替换）
        let data = std::fs::read(path).map_err(|e| format!("无法读取安装包：{e}"))?;
        if let Err(e) = verify_minisign(&data, &sig) {
            // 密钥轮换容错：老版本内嵌的公钥对不上新签名时，若 sha256（官方 API 直连获取）
            // 匹配则放行（安全等级退回 sha256 保障）；两者都不过才拒绝。
            let ok_sha = expected_sha256
                .as_deref()
                .map(|expected| {
                    sha256_file(path)
                        .map(|a| a.eq_ignore_ascii_case(expected))
                        .unwrap_or(false)
                })
                .unwrap_or(false);
            if !ok_sha {
                let _ = std::fs::remove_file(path);
                return Err(format!("安装包签名校验失败（{e}）且无 sha256 兜底，已阻止执行"));
            }
        }
    } else if let Some(expected) = expected_sha256 {
        let actual = sha256_file(path)?;
        if !actual.eq_ignore_ascii_case(&expected) {
            let _ = std::fs::remove_file(path);
            return Err(format!(
                "安装包完整性校验失败（预期 {expected}，实际 {actual}），已阻止执行"
            ));
        }
    }
    let current = std::env::current_exe().map_err(|e| format!("无法定位当前程序：{e}"))?;
    // 目标版本落标记（下次启动对照自身版本判定是否真的更新成功）
    let marker_dir = std::env::temp_dir().join("tongtop-dl");
    let _ = std::fs::create_dir_all(&marker_dir);
    let _ = std::fs::write(marker_dir.join("update-target.txt"), &target_version);

    if asset_kind == "exe" && !cfg!(windows) {
        // Unix 看门狗：sleep 等退出 → cp 覆盖 → open 拉起（同样 15 次重试）
        let install_dir = current
            .parent()
            .ok_or_else(|| "无法定位安装目录".to_string())?
            .to_path_buf();
        let sh = format!(
            "sleep 2; for i in $(seq 1 15); do cp '{}' '{}' && break || sleep 1; done; open '{}'",
            installer_path,
            install_dir.display(),
            current.display()
        );
        let mut cmd = std::process::Command::new("sh");
        cmd.args(["-c", &sh]);
        cmd.spawn().map_err(|e| format!("拉起更新失败：{e}"))?;
        return Ok(());
    }

    if asset_kind == "exe" {
        // 裸 exe 覆盖：运行中的 exe 被锁，等退出后 Copy；重试 15 次防关停慢。
        // 失败也照常拉起（旧版），下次启动的版本对照会如实提示。
        let install_dir = current
            .parent()
            .ok_or_else(|| "无法定位安装目录".to_string())?
            .to_path_buf();
        let ps = format!(
            "Start-Sleep -Seconds 2\n\
             foreach ($i in 1..15) {{ try {{ Copy-Item -LiteralPath '{}' -Destination '{}' -Force -ErrorAction Stop; break }} catch {{ Start-Sleep -Seconds 1 }} }}\n\
             Start-Process -FilePath '{}'\n",
            installer_path,
            install_dir.display(),
            current.display()
        );
        let ps1 = marker_dir.join("apply-update.ps1");
        std::fs::write(&ps1, ps).map_err(|e| format!("写入更新脚本失败：{e}"))?;
        let mut cmd = std::process::Command::new("powershell.exe");
        cmd.args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-WindowStyle",
            "Hidden",
            "-File",
            &ps1.to_string_lossy(),
        ]);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000 | 0x0000_0008); // CREATE_NO_WINDOW | DETACHED_PROCESS
        }
        cmd.spawn().map_err(|e| format!("拉起更新失败：{e}"))?;
        return Ok(());
    }

    // NSIS 回退路径（老版本 Release 没有裸 exe 资产）
    let script = format!(
        "timeout /t 2 /nobreak >nul & \"{}\" /S & start \"\" \"{}\"",
        installer_path,
        current.display()
    );
    let mut cmd = std::process::Command::new("cmd.exe");
    cmd.args(["/c", &script]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW | DETACHED_PROCESS：静默后台看门狗
        cmd.creation_flags(0x0800_0000 | 0x0000_0008);
    }
    cmd.spawn().map_err(|e| format!("拉起更新失败：{e}"))?;
    Ok(())
}

/// 更新结果判定：目标版本标记仍在且高于运行版本 = 上次自动更新没成功（如实告知）。
#[tauri::command]
fn take_update_error() -> Option<String> {
    let marker = std::env::temp_dir()
        .join("tongtop-dl")
        .join("update-target.txt");
    let target = std::fs::read_to_string(&marker).ok()?.trim().to_string();
    if target.is_empty() {
        return None;
    }
    let current = env!("CARGO_PKG_VERSION");
    if semver_gt(&target, current) {
        // 版本没上来：保留提示，删标记（只提醒一次）
        let _ = std::fs::remove_file(&marker);
        return Some(format!(
            "上次自动更新未成功（目标 v{target}，当前仍 v{current}）。常见原因：已安装版本不低于安装包（安装器拒绝同版本覆盖）、多版本并存导致写到了其他位置，或安装器被安全软件拦截。可到官网下载页手动安装。"
        ));
    }
    // 版本已达标（更新成功）或无更新：清掉标记
    let _ = std::fs::remove_file(&marker);
    None
}

/// 自有更新机制配套：裸 exe 覆盖安装后，ARP（卸载列表）里的 DisplayVersion 仍是
/// 首次 NSIS 安装时的旧值——winget list / 已安装页会永远显示旧版本。
/// 启动时对照并同步（HKCU 用户键，无需管理员；找不到卸载项就跳过）。
#[cfg(windows)]
fn sync_arp_display_version() {
    let cur = env!("CARGO_PKG_VERSION");
    let script = format!(
        "Get-ChildItem 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall' | \
         ForEach-Object {{ $p = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue; \
         if ($p.DisplayName -eq 'tongtop-store' -and $p.DisplayVersion -ne '{cur}') {{ \
         Set-ItemProperty -Path $_.PSPath -Name DisplayVersion -Value '{cur}' }} }}"
    );
    let _ = tools::powershell(&script);
}

/// 文件 sha256（流式读取，安装包 ~3MB 一次性亦可，但流式对大包稳）
fn sha256_file(path: &std::path::Path) -> Result<String, String> {
    use sha2::Digest;
    let mut file = std::fs::File::open(path).map_err(|e| format!("无法读取安装包：{e}"))?;
    let mut hasher = sha2::Sha256::new();
    std::io::copy(&mut file, &mut hasher).map_err(|e| format!("计算哈希失败：{e}"))?;
    Ok(format!("{:x}", hasher.finalize()))
}

// ---------- 桌面端（GUI）启动：开始菜单 AppID ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StartAppDto {
    name: String,
    app_id: String,
}

/// 一次列出开始菜单全部应用（前端批量匹配桌面端智能体是否已安装）。
#[tauri::command]
async fn list_start_apps() -> Vec<StartAppDto> {
    tauri::async_runtime::spawn_blocking(|| {
        tools::list_start_apps()
            .into_iter()
            .map(|(name, app_id)| StartAppDto { name, app_id })
            .collect()
    })
    .await
    .unwrap_or_default()
}

#[tauri::command]
fn find_start_app(names: Vec<String>) -> Option<String> {
    tools::find_start_app(&names)
}

#[tauri::command]
fn launch_desktop_app(names: Vec<String>) -> Result<(), String> {
    tools::launch_start_app(&names)
}

/// 真正退出应用（关窗口默认是收进托盘；智能体「任务结束」与自更新走这里）
#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

// ---------- 镜像延迟探测（傻瓜化：后台自动测速选最快） ----------

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct MirrorLatency {
    url: String,
    /// None = 不可达
    ms: Option<u64>,
}

/// TTFB 探测：HTTP 状态码（含 401/403/404）都算可达，只有连不上/超时才算不可达。
fn ping_url(url: &str) -> Option<u64> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(6)))
        .user_agent("tongtop-store/0.2")
        .build()
        .into();
    let t = Instant::now();
    match agent.get(url).call() {
        Ok(_) => Some(t.elapsed().as_millis() as u64),
        Err(ureq::Error::StatusCode(_)) => Some(t.elapsed().as_millis() as u64),
        Err(_) => None,
    }
}

#[tauri::command]
async fn mirror_latencies(urls: Vec<String>) -> Vec<MirrorLatency> {
    tauri::async_runtime::spawn_blocking(move || {
        // 每个 URL 一个线程：总耗时 ≈ 最慢的那个
        let handles: Vec<_> = urls
            .into_iter()
            .map(|url| std::thread::spawn(move || MirrorLatency { ms: ping_url(&url), url }))
            .collect();
        handles.into_iter().filter_map(|h| h.join().ok()).collect()
    })
    .await
    .unwrap_or_default()
}

// ---------- 入口 ----------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .manage(terminal::TermState::default())
        // 系统托盘：关窗口不退出，常驻后台（右键菜单：显示主界面 / 镜像测速 / 退出）
        .setup(|app| {
            use tauri::menu::{MenuBuilder, MenuItemBuilder};
            use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};

            // 自有更新机制配套：同步 ARP DisplayVersion（覆盖安装后 winget list 才看到新版本）
            #[cfg(windows)]
            std::thread::spawn(sync_arp_display_version);

            let show = MenuItemBuilder::with_id("show", "显示主界面").build(app)?;
            let tune = MenuItemBuilder::with_id("tune", "镜像自动测速").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "退出").build(app)?;
            let menu = MenuBuilder::new(app)
                .items(&[&show, &tune])
                .separator()
                .item(&quit)
                .build()?;

            let mut tray = TrayIconBuilder::with_id("main")
                .menu(&menu)
                .tooltip("应用商店")
                .show_menu_on_left_click(false);
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.on_menu_event(|app, e| match e.id().as_ref() {
                "show" => {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.show();
                        let _ = w.unminimize();
                        let _ = w.set_focus();
                    }
                }
                // 通知前端跑一轮镜像测速（窗口隐藏时 JS 照样运行）
                "tune" => {
                    let _ = app.emit("mirror-autotune", ());
                }
                "quit" => app.exit(0),
                _ => {}
            })
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::DoubleClick {
                    button: MouseButton::Left,
                    ..
                } = event
                {
                    let app = tray.app_handle();
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.show();
                        let _ = w.unminimize();
                        let _ = w.set_focus();
                    }
                }
            })
            .build(app)?;
            Ok(())
        })
        // 关窗口 = 收进托盘，不退出（后台持续：镜像测速、任务、更新检测不中断）。
        // 仅限主窗口：终端窗口（term-*）必须真正关闭，否则 PTY 子进程与监听器泄漏。
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            winget_available,
            search_apps,
            app_detail,
            snapshot_load,
            snapshot_refresh,
            github_release,
            gh_cli_status,
            release_notes,
            prefetch_release_notes,
            cleanup_scan,
            cleanup_run,
            leftover_scan,
            leftover_clean,
            check_tools,
            get_user_envs,
            set_user_env,
            mirror_status,
            mirror_apply,
            mirror_latencies,
            launch_agent,
            launch_desktop_app,
            find_start_app,
            list_start_apps,
            check_self_update,
            download_self_update,
            apply_self_update,
            take_update_error,
            catalog_fetch,
            terminal::term_spawn,
            terminal::term_backlog,
            terminal::term_write,
            terminal::term_resize,
            terminal::term_kill,
            quit_app,
            start_task,
            cancel_task,
            activity_start,
            activity_stop,
            activity_status,
            activity_processes,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}


#[cfg(test)]
mod updater_tests {
    use super::*;

    /// 夹具：与 CI 同款私钥（本地生成）对固定内容签名；公钥为编译进应用的 UPDATER_PUBKEY。
    /// 验签通过 + 篡改数据必须失败 = minisign 信任链的核心断言。
    #[test]
    fn minisign_verify_fixture() {
        let data = b"tongtop updater minisign test fixture";
        let sig = r##"dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVUb1NSYmwxd2NVTnFIbHp3bXpSMlVBelN6VFdhY0pwMHN2Z2c3V21SL25yaG1ieWVrR2JaUTA2WXNrRTdGY3RaZlRRVkdEWkpXekNJUW1GYWxWT2MxN085WU53dFBacVFJPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzg5ODkzOTcwCWZpbGU6dG9uZ3RvcC1maXh0dXJlLnR4dApnbnBlUzhWTitoOHh6em05KzJvSFUzdGJJV3FqaGcvdHNZZzNPZEkwY0JQRVFKTm1TYmVpcGprME9lWkxHTnMwRk1kanMyUi9QVUMvNmJKVWw3UGZBQT09Cg=="##;
        assert!(verify_minisign(data, sig).is_ok(), "合法签名应通过: {:?}", verify_minisign(data, sig));
        assert!(verify_minisign(b"tampered payload", sig).is_err(), "篡改内容必须验签失败");
    }


    /// E2E（手动触发）：验证真实发布资产。
    /// 用法：下载 Release 的 tongtop-store.exe 与 .sig 后：
    ///   set TONGTOP_VERIFY_EXE=<exe路径> && set TONGTOP_VERIFY_SIG=<sig路径> && cargo test -- --ignored verify_release_asset
    #[test]
    #[ignore = "需要真实发布资产，手动触发（见注释）"]
    fn verify_release_asset() {
        let exe = std::env::var("TONGTOP_VERIFY_EXE").expect("缺 TONGTOP_VERIFY_EXE");
        let sig = std::env::var("TONGTOP_VERIFY_SIG").expect("缺 TONGTOP_VERIFY_SIG");
        let data = std::fs::read(&exe).expect("读取 exe 失败");
        let sig_text = std::fs::read_to_string(&sig).expect("读取 sig 失败");
        verify_minisign(&data, &sig_text).expect("发布资产验签失败");
    }

    #[test]
    fn sha256_file_known_digest() {
        let dir = std::env::temp_dir().join("tongtop-sha-test");
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("x.txt");
        std::fs::write(&f, b"abc").unwrap();
        // echo -n abc | sha256sum
        assert_eq!(
            sha256_file(&f).unwrap(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
}
