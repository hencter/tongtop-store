/**
 * 数据入口：全部来自仓库根 /data（与桌面端共用一份数据源，零重复维护）。
 * 站点是纯静态构建，新增条目 = 改 JSON + 重新部署。
 */

import appsJson from "../../../data/apps.json";
import agentsJson from "../../../data/agents.json";
import categoriesJson from "../../../data/categories.json";
import mirrorsJson from "../../../data/mirrors.json";
import freeModelsJson from "../../../data/free-models.json";

export interface AppEntry {
  id: string;
  name: string;
  desc: string;
  site: string;
  category: string;
  tags?: string[];
  github?: string;
  ai?: boolean;
  /** 许可证和仓库已核对的开源或自由软件 */
  oss?: boolean;
  /** 展示用许可证简称，对应 proof 里的原文 */
  license?: string;
  /** 许可证文件、GitHub 数字、winget 版本或 X 帖子 */
  proof?: string;
}

export interface EnvSpec {
  name: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
  required?: boolean;
  hint?: string;
  url?: string;
  defaultValue?: string;
}

/**
 * 官方直链安装包（桌面端 .exe / 安装器等）：
 * 官网文档给的"第二种装法"，不经过 npm/pip/winget。
 */
export interface InstallDirect {
  url: string;
  /** 文件大小（字节）；官网卡片上换算成 MB 显式标注 */
  sizeBytes?: number;
  /** 展示文案，如"官方桌面安装包（约 276 MB）" */
  label?: string;
  /** 静默安装参数，如 ["/S"]（NSIS 常见） */
  silentArgs?: string[];
}

export interface AgentEntry {
  id: string;
  name: string;
  vendor: string;
  desc: string;
  /**
   * 「好用程度」排序权重（1 = 最推荐，缺省视为最后一档）。
   * 只在开源/闭源组内生效。规则与桌面端 `src/catalog/agents.ts` 的 `sortAgents` 相同。
   */
  rank?: number;
  homepage: string;
  runtime: "node" | "python" | "none";
  runtimeLabel?: string;
  install: { kind: "npm" | "pip" | "winget"; package: string };
  /** 可选：官方直链安装包。缺省时官网照旧只展示 npm/pip/winget 一种装法 */
  installDirect?: InstallDirect;
  bin: string;
  env: EnvSpec[];
  webPort?: number;
  desktopNames?: string[];
  concerns?: string[];
  notes?: string[];
}

export interface MirrorPreset {
  label: string;
  value: string;
  note?: string;
}

export interface MirrorTool {
  id: string;
  name: string;
  desc: string;
  presets: MirrorPreset[];
  official: string;
  applyNote?: string;
}

export interface FreeModelEnv {
  name: string;
  label: string;
  placeholder?: string;
  value?: string;
}

export interface FreeModelProvider {
  id: string;
  name: string;
  vendor: string;
  summary: string;
  official: string;
  docs: string;
  env: FreeModelEnv[];
  agents: string[];
  note?: string;
  verifiedAt: string;
}

export const CATEGORIES: { id: string; label: string }[] = categoriesJson;
export const APPS: AppEntry[] = appsJson as AppEntry[];

/** 闭源判定：concerns 含 "closed"（不接受公众审查，数据泄露/被用于训练的风险更高） */
export function isClosed(agent: Pick<AgentEntry, "concerns">): boolean {
  return (agent.concerns ?? []).includes("closed");
}

/**
 * 与桌面端 `sortAgents` 同一套规则：
 *  1. 任何闭源智能体不得排在开源智能体之前；
 *  2. 同组内按 `rank` 升序（1 最推荐，缺省视为最后一档）；
 *  3. rank 相同保持数据源原有顺序。
 */
export function sortAgents<T extends Pick<AgentEntry, "concerns" | "rank">>(list: readonly T[]): T[] {
  const weight = (agent: T) => agent.rank ?? Number.MAX_SAFE_INTEGER;
  return [...list].sort((a, b) => {
    const closed = Number(isClosed(a)) - Number(isClosed(b));
    if (closed !== 0) return closed;
    return weight(a) - weight(b);
  });
}

export const AGENTS: AgentEntry[] = sortAgents(agentsJson as AgentEntry[]);
export const MIRRORS: MirrorTool[] = mirrorsJson.tools as MirrorTool[];
export const FREE_MODELS: { updatedAt: string; providers: FreeModelProvider[] } = freeModelsJson;

export function appsByCategory(id: string): AppEntry[] {
  return id === "ai" ? APPS.filter((a) => a.category === "ai" || a.ai) : APPS.filter((a) => a.category === id);
}

export function categoryLabel(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

/** 智能体安装命令（官网/文档里给用户复制的标准命令） */
export function installCommand(agent: AgentEntry): string {
  switch (agent.install.kind) {
    case "npm":
      return `npm install -g ${agent.install.package}`;
    case "pip":
      return `pip install ${agent.install.package}`;
    default:
      return `winget install --id ${agent.install.package} -e`;
  }
}

/** 取主机名（非法 URL 返回空串，不抛错） */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** 可注册域（取最后两段，够用于 deepseek.com 这类站点） */
function registrableDomain(host: string): string {
  const parts = host.split(".").filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2).join(".") : host;
}

/** 字节数 → 人类可读体积（1 MB = 1048576 字节，与文件管理器口径一致） */
export function formatBytes(bytes?: number): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) return "";
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${Math.round(mb)} MB`;
}

/**
 * 直链来源标注：与官网同域时显式说明是官方域名，否则如实给出主机名。
 * 例：download.deepseek.com（deepseek.com 官方域名）
 */
export function directSourceLabel(direct: InstallDirect, homepage?: string): string {
  const host = hostOf(direct.url);
  if (!host) return "";
  const root = registrableDomain(host);
  const officialRoot = homepage ? registrableDomain(hostOf(homepage)) : "";
  const isOfficial = Boolean(officialRoot.includes(".")) && officialRoot === root;
  return isOfficial ? `${host}（${root} 官方域名）` : host;
}

/**
 * 直链安装包的一行说明，如：
 * "官方桌面安装包（约 276 MB） · 来源 download.deepseek.com（官方域名）"
 * 体积不重复堆叠：label 里已含体积时不再补一条。
 */
export function directMeta(direct: InstallDirect, homepage?: string): string {
  const label = direct.label?.trim() || "官方安装包";
  const size = formatBytes(direct.sizeBytes);
  const source = directSourceLabel(direct, homepage);
  return [label, size && !label.includes(size) ? `约 ${size}` : "", source && `来源 ${source}`]
    .filter(Boolean)
    .join(" · ");
}

/** 静默安装参数（展示用，如 "/S"） */
export function directSilentArgs(direct: InstallDirect): string {
  return (direct.silentArgs ?? []).filter((a) => typeof a === "string" && a.trim()).join(" ");
}

export function agentKind(agent: AgentEntry): string {
  return agent.desktopNames ? "桌面端" : agent.webPort ? "Web" : "CLI";
}

/** Windows 用户级环境变量设置命令（PowerShell） */
export function psEnvCommand(name: string, value: string): string {
  return `[Environment]::SetEnvironmentVariable('${name}','${value}','User')`;
}
