/**
 * AI 智能体配方：管理「安装 → 配置 → 启动」全生命周期。
 * 每个配方是一条声明式流水线，由 agentStore 顺序执行：
 * 检查运行时 → 装运行时（winget）→ 装本体（npm/pip/winget）→ 写环境变量 → 启动。
 *
 * 数据本体在 /data/agents.json（与 Astro 网站共用一份数据源）。
 * 所有包均已实测存在（npm 经 npmmirror、pip 经 TUNA、winget 官方源）。
 */

import agents from "../../data/agents.json";

export interface EnvSpec {
  name: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
  required?: boolean;
  hint?: string;
  /** 获取密钥的直达链接（hint 变为可点击跳转） */
  url?: string;
  defaultValue?: string;
}

export interface AgentRecipe {
  id: string;
  name: string;
  vendor: string;
  desc: string;
  homepage: string;
  /** 运行时依赖 */
  runtime: "node" | "python" | "none";
  runtimeWinget?: string;
  runtimeLabel?: string;
  /** 本体安装方式 */
  install:
    | { kind: "npm"; package: string }
    | { kind: "pip"; package: string }
    | { kind: "winget"; package: string };
  /** 可执行名（npm 全局 bin / Scripts / 已知位置） */
  bin: string;
  /** 启动时追加到 PATH 的目录（%VAR% 占位由宿主展开） */
  pathExtra: string[];
  env: EnvSpec[];
  /** 非 REPL 型工具用 cmd /k 保持窗口 */
  keepOpen?: boolean;
  launchArgs?: string[];
  /** Web 型：启动后拉起本地服务并自动打开浏览器到此端口 */
  webPort?: number;
  /** 桌面端（GUI）：经开始菜单 AppID 启动（值为快捷方式名匹配词） */
  desktopNames?: string[];
  notes?: string[];
}

export const AGENTS: AgentRecipe[] = agents as AgentRecipe[];
