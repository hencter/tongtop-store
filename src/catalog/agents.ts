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
  /**
   * 「好用程度」排序权重（1 = 最推荐，缺省视为最后一档）。
   * 判定口径 = 装完能不能立刻用上 + 日常采用度 + 国内可达性，不看名气。
   * 只在**同开源/闭源组内**生效，不违反「闭源沉底」铁律。
   */
  rank?: number;
  homepage: string;
  /** 运行时依赖 */
  runtime: "node" | "python" | "none";
  runtimeWinget?: string;
  runtimeLabel?: string;
  /** 本体安装方式（包管理器一键装）；与 installDirect 可并存，界面给用户两种装法 */
  install:
    | { kind: "npm"; package: string }
    | { kind: "pip"; package: string }
    | { kind: "winget"; package: string };
  /**
   * 官方直链安装包（包管理器没有的形态，如官方桌面安装器）。
   * 与 install 二选一或并存：并存时界面给用户两种装法。
   */
  installDirect?: {
    url: string;
    sizeBytes?: number;
    label?: string;
    /** 静默安装参数（NSIS 一般是 /S） */
    silentArgs?: string[];
  };
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

export function isClosed(recipe: Pick<AgentRecipe, "concerns">): boolean {
  return recipe.concerns?.includes("closed") === true;
}

/**
 * 排序规则（与官网一致）：
 *  1. **铁律**：任何闭源智能体不得排在开源智能体之前；
 *  2. 同组内按「好用程度」`rank` 升序（1 最推荐，缺省视为最后一档）；
 *  3. rank 相同保持数据源原有顺序（Array#sort 在 ES2019+ 稳定）。
 */
export function sortAgents<T extends Pick<AgentRecipe, "concerns" | "rank">>(
  list: readonly T[],
): T[] {
  const weight = (a: T) => a.rank ?? Number.MAX_SAFE_INTEGER;
  return [...list].sort((a, b) => {
    const closed = Number(isClosed(a)) - Number(isClosed(b));
    if (closed !== 0) return closed;
    return weight(a) - weight(b);
  });
}

export const AGENTS: AgentRecipe[] = sortAgents(agents as AgentRecipe[]);
