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
  /** 风险提示标签：闭源 / 上传数据 / 使用限制（卡片与装机页隐约标记） */
  concerns?: ConcernTag[];
  notes?: string[];
}

/** 风险标签定义（标签 → 短徽标文案 + 完整警示文案） */
export type ConcernTag = "closed" | "data" | "restriction";

export const CONCERN_LABEL: Record<ConcernTag, string> = {
  closed: "闭源",
  data: "上传数据",
  restriction: "使用限制",
};

export const CONCERN_CAUTION: Record<ConcernTag, string> = {
  closed: "闭源：无法审计其代码与数据去向",
  data: "上传数据：代码与对话内容会上传至厂商服务器，存在被收集（甚至用于训练）的风险",
  restriction: "使用限制：绑定厂商账号，受条款/地域/订阅限制，可能随时不可用——不具备公平性",
};

export const AGENTS: AgentRecipe[] = agents as AgentRecipe[];
