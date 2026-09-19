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

export interface AgentEntry {
  id: string;
  name: string;
  vendor: string;
  desc: string;
  homepage: string;
  runtime: "node" | "python" | "none";
  runtimeLabel?: string;
  install: { kind: "npm" | "pip" | "winget"; package: string };
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
export const AGENTS: AgentEntry[] = agentsJson as AgentEntry[];
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

export function agentKind(agent: AgentEntry): string {
  return agent.desktopNames ? "桌面端" : agent.webPort ? "Web" : "CLI";
}

/** Windows 用户级环境变量设置命令（PowerShell） */
export function psEnvCommand(name: string, value: string): string {
  return `[Environment]::SetEnvironmentVariable('${name}','${value}','User')`;
}
