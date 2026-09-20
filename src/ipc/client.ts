/**
 * IPC 客户端：组件一律经这里调宿主，不直接 invoke。
 * 浏览器里跑 `pnpm dev`（无 Tauri 注入）时用目录数据兜底，
 * 界面照常可预览 —— 宿主能力缺失时如实降级，不假装。
 */

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CATALOG } from "../catalog/apps";
import type {
  AppDetail,
  AppInfo,
  CleanupInfo,
  CleanupResult,
  GhCliStatus,
  GhRelease,
  LaunchSpec,
  LeftoverReport,
  CleanReport,
  ProcDto,
  MirrorLatency,
  MirrorStatus,
  NotesDto,
  SelfUpdateInfo,
  SnapshotDto,
  StartApp,
  TaskSpec,
  ToolStatus,
} from "./types";

const isTauri = () => "__TAURI_INTERNALS__" in window;

export async function wingetAvailable(): Promise<boolean> {
  if (!isTauri()) return false;
  return invoke<boolean>("winget_available");
}

export async function searchApps(query: string): Promise<AppInfo[]> {
  if (!isTauri()) {
    const q = query.toLowerCase();
    return CATALOG.filter(
      (a) => a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q),
    ).map((a) => ({ name: a.name, id: a.id, version: "" }));
  }
  return invoke<AppInfo[]>("search_apps", { query });
}

export async function appDetail(id: string): Promise<AppDetail> {
  if (!isTauri()) {
    const c = CATALOG.find((a) => a.id.toLowerCase() === id.toLowerCase());
    return {
      id,
      name: c?.name ?? id,
      version: "",
      publisher: "",
      homepage: c?.site ?? "",
      description: c?.desc ?? "",
      urls: c ? [c.site] : [],
    };
  }
  return invoke<AppDetail>("app_detail", { id });
}

export async function githubRelease(repo: string): Promise<GhRelease> {
  if (!isTauri()) {
    // 浏览器预览：给一份演示数据，界面照常可看
    return {
      repo,
      tag: "v1.0.0",
      name: "预览模式演示发布",
      publishedAt: new Date().toISOString(),
      url: `https://github.com/${repo}/releases`,
      body: "预览模式演示日志",
      assets: [
        { name: "demo-setup-x64.exe", url: `https://github.com/${repo}/releases`, size: 24_500_000, downloads: 12345 },
      ],
    };
  }
  return invoke<GhRelease>("github_release", { repo });
}

export async function startTask(id: string, spec: TaskSpec): Promise<void> {
  if (!isTauri()) throw new Error("浏览器预览模式：安装能力仅在桌面端可用");
  return invoke("start_task", { id, spec });
}

export async function cancelTask(id: string): Promise<boolean> {
  if (!isTauri()) return false;
  return invoke<boolean>("cancel_task", { id });
}

export async function snapshotLoad(): Promise<SnapshotDto> {
  if (!isTauri()) return { installed: [], upgrades: [], installedAt: 0, upgradesAt: 0 };
  return invoke<SnapshotDto>("snapshot_load");
}

export async function snapshotRefresh(force: boolean): Promise<SnapshotDto> {
  if (!isTauri()) return { installed: [], upgrades: [], installedAt: 0, upgradesAt: 0 };
  return invoke<SnapshotDto>("snapshot_refresh", { force });
}

export async function checkTools(names: string[]): Promise<ToolStatus[]> {
  if (!isTauri()) return names.map((name) => ({ name, installed: false, path: null, version: null }));
  return invoke<ToolStatus[]>("check_tools", { names });
}

export async function getUserEnvs(names: string[]): Promise<Record<string, string>> {
  if (!isTauri()) return {};
  return invoke<Record<string, string>>("get_user_envs", { names });
}

export async function setUserEnv(name: string, value: string): Promise<void> {
  if (!isTauri()) return;
  return invoke("set_user_env", { name, value });
}

export async function mirrorStatus(tools: string[]): Promise<MirrorStatus[]> {
  if (!isTauri()) return tools.map((tool) => ({ tool, installed: false, current: "" }));
  return invoke<MirrorStatus[]>("mirror_status", { toolsList: tools });
}

export async function mirrorApply(tool: string, value: string): Promise<string> {
  if (!isTauri()) return "浏览器预览模式";
  return invoke<string>("mirror_apply", { tool, value });
}

export async function launchAgent(spec: LaunchSpec): Promise<void> {
  if (!isTauri()) throw new Error("浏览器预览模式");
  return invoke("launch_agent", { spec });
}

/** 桌面端（GUI）：经开始菜单 AppID 启动，无需知道 exe 落点 */
export async function launchDesktopApp(names: string[]): Promise<void> {
  if (!isTauri()) return;
  return invoke("launch_desktop_app", { names });
}

/** 按开始菜单快捷方式名查找（装机流水线验证桌面端用） */
export async function findDesktopApp(names: string[]): Promise<string | null> {
  if (!isTauri()) return null;
  return invoke<string | null>("find_start_app", { names });
}

/** 一次列出开始菜单全部应用（批量检测桌面端是否已安装） */
export async function listStartApps(): Promise<StartApp[]> {
  if (!isTauri()) return [];
  return invoke<StartApp[]>("list_start_apps");
}

export async function releaseNotes(id: string): Promise<NotesDto> {
  if (!isTauri()) return { id, notes: "预览模式：无更新日志", url: "", source: "mock" };
  return invoke<NotesDto>("release_notes", { id });
}

export async function prefetchReleaseNotes(ids: string[]): Promise<number> {
  if (!isTauri()) return 0;
  return invoke<number>("prefetch_release_notes", { ids });
}

export async function cleanupScan(): Promise<CleanupInfo> {
  if (!isTauri()) {
    return {
      dir: "C:\\Users\\demo\\AppData\\Local\\Temp\\WinGet",
      totalBytes: 386_000_000,
      fileCount: 42,
      dirCount: 7,
      items: [
        { name: "Tencent.WeChat.3.9.12", size: 268_000_000, files: 3, modified: 0 },
        { name: "Git.Git.2.55", size: 98_000_000, files: 2, modified: 0 },
      ],
      wingetRunning: false,
      taskRunning: false,
    };
  }
  return invoke<CleanupInfo>("cleanup_scan");
}

export async function cleanupRun(): Promise<CleanupResult> {
  if (!isTauri()) return { freedBytes: 0, deleted: 0, skipped: 0 };
  return invoke<CleanupResult>("cleanup_run");
}

export async function ghCliStatus(): Promise<GhCliStatus> {
  if (!isTauri()) return { installed: false, authed: false };
  return invoke<GhCliStatus>("gh_cli_status");
}

export async function leftoverScan(id: string, name: string): Promise<LeftoverReport> {
  if (!isTauri()) {
    return {
      registry: [{ key: "HKCU\\Software\\Demo\\WeChat", name: "WeChat", kind: "software" }],
      dirs: [{ path: "C:\\Users\\demo\\AppData\\Roaming\\WeChat", size: 128_000_000 }],
    };
  }
  return invoke<LeftoverReport>("leftover_scan", { id, name });
}

export async function leftoverClean(dirs: string[], keys: string[]): Promise<CleanReport> {
  if (!isTauri()) return { freedBytes: 0, dirsDeleted: 0, dirsSkipped: 0, keysDeleted: 0, keysSkipped: 0 };
  return invoke<CleanReport>("leftover_clean", { dirs, keys });
}

export async function activityStart(roots: string[]): Promise<void> {
  if (!isTauri()) return;
  return invoke("activity_start", { roots });
}

export async function activityStop(): Promise<boolean> {
  if (!isTauri()) return false;
  return invoke<boolean>("activity_stop");
}

export async function activityStatus(): Promise<boolean> {
  if (!isTauri()) return false;
  return invoke<boolean>("activity_status");
}

export async function activityProcesses(): Promise<ProcDto[]> {
  if (!isTauri()) return [];
  return invoke<ProcDto[]>("activity_processes");
}

/** 批量探测镜像延迟（并行，TTFB；ms 为 null 表示不可达） */
export async function mirrorLatencies(urls: string[]): Promise<MirrorLatency[]> {
  if (!isTauri()) return urls.map((url) => ({ url, ms: Math.floor(Math.random() * 120) + 20 }));
  return invoke<MirrorLatency[]>("mirror_latencies", { urls });
}

/** 商店自更新：检查 GitHub Releases 上的新版本 */
export async function checkSelfUpdate(): Promise<SelfUpdateInfo> {
  if (!isTauri()) {
    return { current: "0.6.3", latest: "0.6.3", notes: "", releaseUrl: "", assetUrl: "", assetSize: 0, hasUpdate: false, expectedSha256: null, signature: null, assetKind: "exe" };
  }
  return invoke<SelfUpdateInfo>("check_self_update");
}

/** 从网站静态 API 拉最新目录数据（首页推荐实时更新；失败时调用方保留内置数据） */
export interface CatalogDto {
  apps: unknown[];
  agents: unknown[];
  categories: unknown[];
  devtools: unknown[];
  mirrors: { tools: unknown[]; ghProxies: unknown[] };
  updatedAt: number;
}
export async function catalogFetch(base: string): Promise<CatalogDto> {
  if (!isTauri()) throw new Error("浏览器预览模式");
  return invoke<CatalogDto>("catalog_fetch", { base });
}

/** 下载新版安装包（进度走 self-update-progress 事件）：直连优先，失败回退加速通道；大小校验 */
export async function downloadSelfUpdate(
  url: string,
  fallbackUrl: string | null,
  expectedSize: number,
): Promise<string> {
  if (!isTauri()) throw new Error("浏览器预览模式");
  return invoke<string>("download_self_update", { url, fallbackUrl, expectedSize });
}

/** 静默更新看门狗：minisign 验签（优先）/ sha256 校验 → 应用资产 → 自动拉起新版本 */
export async function applySelfUpdate(
  installerPath: string,
  expectedSha256: string | null,
  signature: string | null,
  targetVersion: string,
  assetKind: string,
): Promise<void> {
  if (!isTauri()) return;
  return invoke("apply_self_update", { installerPath, expectedSha256, signature, targetVersion, assetKind });
}

/** 读取并清除上次更新失败标记（安装器非零退出时由看门狗留证） */
export async function takeUpdateError(): Promise<string | null> {
  if (!isTauri()) return null;
  return invoke<string | null>("take_update_error");
}

/** 真正退出应用（关窗口默认收进托盘） */
export async function quitApp(): Promise<void> {
  if (!isTauri()) return;
  return invoke("quit_app");
}

// ---------- 内嵌终端（ConPTY + xterm.js） ----------

export interface TermSpec {
  program: string;
  args?: string[];
  env?: Record<string, string>;
  pathExtra?: string[];
  cols?: number;
  rows?: number;
}

/** 启动一条 PTY 会话（输出走 term-data-<id> 事件，退出走 term-exit-<id>） */
export async function termSpawn(id: string, spec: TermSpec): Promise<void> {
  if (!isTauri()) throw new Error("浏览器预览模式：终端能力仅在桌面端可用");
  return invoke("term_spawn", { id, spec });
}

/** 挂载前输出的回滚缓冲（新窗口补发用） */
export async function termBacklog(id: string): Promise<string> {
  if (!isTauri()) return "";
  return invoke<string>("term_backlog", { id });
}

export async function termWrite(id: string, data: string): Promise<void> {
  if (!isTauri()) return;
  return invoke("term_write", { id, data });
}

export async function termResize(id: string, cols: number, rows: number): Promise<void> {
  if (!isTauri()) return;
  return invoke("term_resize", { id, cols, rows });
}

/** 杀进程（关窗时调用） */
export async function termKill(id: string): Promise<void> {
  if (!isTauri()) return;
  return invoke("term_kill", { id });
}

/** 打开独立的终端渲染窗口（无边框，自定义品牌标题栏；?term= 路由） */
export async function openTerminalWindow(id: string, title: string): Promise<void> {
  if (!isTauri()) return;
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  new WebviewWindow(`term-${id}`, {
    url: `index.html?term=${encodeURIComponent(id)}&title=${encodeURIComponent(title)}`,
    title,
    width: 920,
    height: 580,
    minWidth: 480,
    minHeight: 320,
    decorations: false,
  });
}

/** 隐藏窗口收进托盘（启动智能体后常驻后台；托盘图标可唤回） */
export async function hideWindow(): Promise<void> {
  if (!isTauri()) return;
  await getCurrentWindow().hide();
}
