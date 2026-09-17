/**
 * AI 智能体配方：管理「安装 → 配置 → 启动」全生命周期。
 * 每个配方是一条声明式流水线，由 agentStore 顺序执行：
 * 检查运行时 → 装运行时（winget）→ 装本体（npm/pip/winget）→ 写环境变量 → 启动。
 *
 * 所有包均已实测存在（npm 经 npmmirror、pip 经 TUNA、winget 官方源）。
 */

export interface EnvSpec {
  name: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
  required?: boolean;
  hint?: string;
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

const NODE_DIR = "%ProgramFiles%\\nodejs";
const NPM_BIN = "%APPDATA%\\npm";
const PY_DIR = "%LOCALAPPDATA%\\Programs\\Python\\Python313";

export const AGENTS: AgentRecipe[] = [
  {
    id: "claude",
    name: "Claude Code",
    vendor: "Anthropic",
    desc: "终端里的 AI 编程搭档：读代码库、改 bug、跑命令、提提交",
    homepage: "https://www.anthropic.com/claude-code",
    runtime: "node",
    runtimeWinget: "OpenJS.NodeJS.LTS",
    runtimeLabel: "Node.js LTS",
    install: { kind: "npm", package: "@anthropic-ai/claude-code" },
    bin: "claude",
    pathExtra: [NODE_DIR, NPM_BIN],
    env: [
      {
        name: "ANTHROPIC_AUTH_TOKEN",
        label: "API Key / Token",
        placeholder: "sk-ant-...",
        secret: true,
        required: true,
        hint: "console.anthropic.com 或你的中转服务商",
      },
      {
        name: "ANTHROPIC_BASE_URL",
        label: "Base URL（可选，中转/代理）",
        placeholder: "https://your-relay.example.com",
        hint: "直连官方 API 可留空",
      },
    ],
  },
  {
    id: "codex",
    name: "Codex CLI",
    vendor: "OpenAI",
    desc: "OpenAI 官方终端编程智能体，轻量、可审阅改动",
    homepage: "https://github.com/openai/codex",
    runtime: "node",
    runtimeWinget: "OpenJS.NodeJS.LTS",
    runtimeLabel: "Node.js LTS",
    install: { kind: "npm", package: "@openai/codex" },
    bin: "codex",
    pathExtra: [NODE_DIR, NPM_BIN],
    env: [
      {
        name: "OPENAI_API_KEY",
        label: "OpenAI API Key",
        placeholder: "sk-...",
        secret: true,
        required: true,
        hint: "platform.openai.com",
      },
      {
        name: "OPENAI_BASE_URL",
        label: "Base URL（可选）",
        placeholder: "https://api.openai.com/v1",
      },
    ],
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    vendor: "Google",
    desc: "Google 开源终端智能体，免费额度慷慨",
    homepage: "https://github.com/google-gemini/gemini-cli",
    runtime: "node",
    runtimeWinget: "OpenJS.NodeJS.LTS",
    runtimeLabel: "Node.js LTS",
    install: { kind: "npm", package: "@google/gemini-cli" },
    bin: "gemini",
    pathExtra: [NODE_DIR, NPM_BIN],
    env: [
      {
        name: "GEMINI_API_KEY",
        label: "Gemini API Key",
        placeholder: "AIza...",
        secret: true,
        required: true,
        hint: "aistudio.google.com 免费申请",
      },
    ],
  },
  {
    id: "qwen",
    name: "Qwen Code",
    vendor: "阿里通义",
    desc: "通义千问编程 CLI，国内直连、中文友好",
    homepage: "https://github.com/QwenLM/qwen-code",
    runtime: "node",
    runtimeWinget: "OpenJS.NodeJS.LTS",
    runtimeLabel: "Node.js LTS",
    install: { kind: "npm", package: "@qwen-code/qwen-code" },
    bin: "qwen",
    pathExtra: [NODE_DIR, NPM_BIN],
    env: [
      {
        name: "OPENAI_API_KEY",
        label: "DashScope API Key",
        placeholder: "sk-...",
        secret: true,
        required: true,
        hint: "dashscope.console.aliyun.com",
      },
      {
        name: "OPENAI_BASE_URL",
        label: "Base URL",
        defaultValue: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      },
      {
        name: "OPENAI_MODEL",
        label: "模型",
        defaultValue: "qwen3-coder-plus",
      },
    ],
  },
  {
    id: "aider",
    name: "Aider",
    vendor: "开源社区",
    desc: "老牌开源 AI 结对编程工具，支持 DeepSeek 等百家模型",
    homepage: "https://aider.chat/",
    runtime: "python",
    runtimeWinget: "Python.Python.3.13",
    runtimeLabel: "Python 3.13",
    install: { kind: "pip", package: "aider-chat" },
    bin: "aider",
    pathExtra: [PY_DIR, `${PY_DIR}\\Scripts`],
    env: [
      {
        name: "OPENAI_API_KEY",
        label: "API Key（OpenAI 或 DeepSeek 等）",
        placeholder: "sk-...",
        secret: true,
        required: true,
        hint: "按你用的模型服务商填",
      },
      {
        name: "OPENAI_API_BASE",
        label: "API Base（可选）",
        placeholder: "https://api.deepseek.com",
      },
    ],
    notes: ["首次启动后输入 /model 选择模型，详见 aider.chat 文档"],
  },
  {
    id: "ollama",
    name: "Ollama",
    vendor: "开源社区",
    desc: "本地跑开源大模型：零密钥、零联网、数据不出机",
    homepage: "https://ollama.com/",
    runtime: "none",
    install: { kind: "winget", package: "Ollama.Ollama" },
    bin: "ollama",
    pathExtra: ["%LOCALAPPDATA%\\Programs\\Ollama"],
    env: [],
    keepOpen: true,
    notes: ["安装后服务自动后台运行；终端里 ollama run qwen3 即可拉模型开聊"],
  },

  // ---- 各家模型厂商官方智能体 ----

  {
    id: "dsh",
    name: "DeepSeek Harness",
    vendor: "DeepSeek",
    desc: "DeepSeek 官方智能体运行时：万物皆插件，Web 端开箱即用",
    homepage: "https://deepseek.com/harness",
    runtime: "node",
    runtimeWinget: "OpenJS.NodeJS.LTS",
    runtimeLabel: "Node.js LTS",
    install: { kind: "npm", package: "@deepseek-ai/dsh" },
    bin: "dsh",
    pathExtra: [NODE_DIR, NPM_BIN],
    env: [
      {
        name: "DEEPSEEK_API_KEY",
        label: "DeepSeek API Key（可选）",
        placeholder: "sk-...",
        secret: true,
        hint: "platform.deepseek.com；也可启动后在 Web 端配置",
      },
    ],
    webPort: 8080,
    launchArgs: ["web", "--port", "8080"],
    notes: ["Web 端首次启动会自动初始化 profile；点「启动」拉起本地服务并自动打开浏览器"],
  },
  {
    id: "workbuddy",
    name: "WorkBuddy CLI",
    vendor: "WorkBuddy",
    desc: "WorkBuddy 官方终端智能体，任务编排与执行一体化",
    homepage: "https://www.npmjs.com/package/@workbuddy/cli-vnext",
    runtime: "node",
    runtimeWinget: "OpenJS.NodeJS.LTS",
    runtimeLabel: "Node.js LTS",
    install: { kind: "npm", package: "@workbuddy/cli-vnext" },
    bin: "workbuddy-vnext",
    pathExtra: [NODE_DIR, NPM_BIN],
    env: [],
    keepOpen: true,
    notes: ["首次运行按终端提示登录账号"],
  },
  {
    id: "kimi-code",
    name: "Kimi Code CLI",
    vendor: "月之暗面",
    desc: "Moonshot 官方编程智能体，Kimi K2 模型加持，国内直连",
    homepage: "https://www.kimi.com/",
    runtime: "none",
    install: { kind: "winget", package: "MoonshotAI.KimiCodeCLI" },
    bin: "kimi-code",
    pathExtra: [],
    env: [
      {
        name: "MOONSHOT_API_KEY",
        label: "Moonshot API Key（可选）",
        placeholder: "sk-...",
        secret: true,
        hint: "platform.moonshot.cn；也可启动后交互登录",
      },
    ],
    desktopNames: ["Kimi Code CLI", "Kimi Code", "Kimi"],
  },

  // ---- 桌面端（GUI 客户端，winget 一键装，点开始菜单图标即用） ----

  {
    id: "doubao",
    name: "豆包",
    vendor: "字节跳动",
    desc: "字节跳动 AI 助手桌面端：对话、写作、绘图、编程全能",
    homepage: "https://www.doubao.com/",
    runtime: "none",
    install: { kind: "winget", package: "ByteDance.Doubao" },
    bin: "doubao",
    pathExtra: [],
    env: [],
    desktopNames: ["豆包", "Doubao"],
  },
  {
    id: "yuanbao",
    name: "腾讯元宝",
    vendor: "腾讯",
    desc: "腾讯混元大模型桌面助手，微信生态文件直读",
    homepage: "https://yuanbao.tencent.com/",
    runtime: "none",
    install: { kind: "winget", package: "Tencent.Yuanbao" },
    bin: "yuanbao",
    pathExtra: [],
    env: [],
    desktopNames: ["腾讯元宝", "元宝", "Yuanbao"],
  },
  {
    id: "coze",
    name: "扣子",
    vendor: "字节跳动",
    desc: "扣子智能体平台桌面端：零代码搭自己的 AI 应用",
    homepage: "https://www.coze.cn/",
    runtime: "none",
    install: { kind: "winget", package: "ByteDance.Coze" },
    bin: "coze",
    pathExtra: [],
    env: [],
    desktopNames: ["扣子", "Coze"],
  },
  {
    id: "lobehub",
    name: "LobeHub",
    vendor: "开源社区",
    desc: "高颜值开源 AI 聚合桌面端，接百家模型、插件市场",
    homepage: "https://lobehub.com/",
    runtime: "none",
    install: { kind: "winget", package: "LobeHub.LobeHub" },
    bin: "lobehub",
    pathExtra: [],
    env: [],
    desktopNames: ["LobeHub"],
  },
];
