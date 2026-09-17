/** IPC 契约：与 Rust 侧 serde camelCase DTO 一一对应。 */

export interface AppInfo {
  name: string;
  id: string;
  version: string;
}

export interface UpgradeInfo {
  name: string;
  id: string;
  version: string;
  available: string;
}

export interface AppDetail {
  id: string;
  name: string;
  version: string;
  publisher: string;
  homepage: string;
  description: string;
  urls: string[];
}

export type TaskKind = "install" | "upgrade" | "uninstall";

/** 任务规格（与 Rust TaskSpec 对应） */
export interface TaskSpec {
  kind: "winget" | "process" | "download";
  action?: "install" | "upgrade" | "uninstall";
  wingetId?: string;
  silent?: boolean;
  program?: string;
  args?: string[];
  pathExtra?: string[];
  display?: string;
  /** winget install 的 --location（自定义安装目录，如 D:\Apps） */
  location?: string;
  /** download 任务：安装包直链（args 为静默安装参数） */
  url?: string;
}

export interface LaunchSpec {
  program: string;
  args?: string[];
  env?: Record<string, string>;
  pathExtra?: string[];
}

export interface ToolStatus {
  name: string;
  installed: boolean;
  path: string | null;
  version: string | null;
}

export interface MirrorStatus {
  tool: string;
  installed: boolean;
  current: string;
}

/** 已安装/可更新的 SQLite 快照（毫秒级可读；后台刷新落库） */
export interface SnapshotDto {
  installed: AppInfo[];
  upgrades: UpgradeInfo[];
  installedAt: number;
  upgradesAt: number;
}

export interface GhAsset {
  name: string;
  url: string;
  size: number;
  downloads: number;
}

export interface GhRelease {
  repo: string;
  tag: string;
  name: string;
  publishedAt: string;
  url: string;
  assets: GhAsset[];
  /** 发行说明正文（markdown） */
  body: string;
}

export interface TaskStartedEvent {
  id: string;
  label: string;
  command: string;
}

export interface TaskQueuedEvent {
  id: string;
  label: string;
}

export interface TaskLogEvent {
  id: string;
  lines: string[];
  progress: number | null;
}

export interface NotesDto {
  id: string;
  notes: string;
  url: string;
  source: string;
}

export interface CleanupItem {
  name: string;
  size: number;
  files: number;
  modified: number;
}

export interface CleanupInfo {
  dir: string;
  totalBytes: number;
  fileCount: number;
  dirCount: number;
  items: CleanupItem[];
  wingetRunning: boolean;
  taskRunning: boolean;
}

export interface CleanupResult {
  freedBytes: number;
  deleted: number;
  skipped: number;
}

export interface TaskDoneEvent {
  id: string;
  code: number;
  success: boolean;
  errorTail: string[];
}

/** 镜像延迟探测结果（ms 为 null 表示不可达） */
export interface MirrorLatency {
  url: string;
  ms: number | null;
}

/** 商店自更新信息（自家 GitHub Releases） */
export interface SelfUpdateInfo {
  current: string;
  latest: string;
  notes: string;
  releaseUrl: string;
  assetUrl: string;
  assetSize: number;
  hasUpdate: boolean;
}
