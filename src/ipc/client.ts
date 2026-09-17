/**
 * IPC 客户端：组件一律经这里调宿主，不直接 invoke。
 * 浏览器里跑 `pnpm dev`（无 Tauri 注入）时用目录数据兜底，
 * 界面照常可预览 —— 宿主能力缺失时如实降级，不假装。
 */

import { invoke } from "@tauri-apps/api/core";
import { CATALOG } from "../catalog/apps";
import type {
  AppDetail,
  AppInfo,
  CleanupInfo,
  CleanupResult,
  GhRelease,
  LaunchSpec,
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

/** 批量探测镜像延迟（并行，TTFB；ms 为 null 表示不可达） */
export async function mirrorLatencies(urls: string[]): Promise<MirrorLatency[]> {
  if (!isTauri()) return urls.map((url) => ({ url, ms: Math.floor(Math.random() * 120) + 20 }));
  return invoke<MirrorLatency[]>("mirror_latencies", { urls });
}

/** 商店自更新：检查 GitHub Releases 上的新版本 */
export async function checkSelfUpdate(): Promise<SelfUpdateInfo> {
  if (!isTauri()) {
    return { current: "0.2.0", latest: "0.2.0", notes: "", releaseUrl: "", assetUrl: "", assetSize: 0, hasUpdate: false };
  }
  return invoke<SelfUpdateInfo>("check_self_update");
}

/** 下载新版安装包（进度走 self-update-progress 事件），返回临时文件路径 */
export async function downloadSelfUpdate(url: string): Promise<string> {
  if (!isTauri()) throw new Error("浏览器预览模式");
  return invoke<string>("download_self_update", { url });
}

/** 真正退出应用（关窗口默认收进托盘） */
export async function quitApp(): Promise<void> {
  if (!isTauri()) return;
  return invoke("quit_app");
}
