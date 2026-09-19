/**
 * 智能体装机流水线：检查运行时 → 装运行时 → 装本体 → 写环境变量 → 完成。
 * 全程顺序执行（宿主同一时刻只跑一个任务），日志直通任务面板。
 */

import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { type AgentRecipe } from "../catalog/agents";
import { useCatalogStore } from "./catalogStore";
import * as ipc from "../ipc/client";
import type { TaskLogEvent, TaskSpec } from "../ipc/types";
import { useTaskStore } from "./taskStore";
import { useSettingsStore } from "./settingsStore";
import { deepUninstall } from "./leftoverStore";

export type StepStatus = "pending" | "running" | "ok" | "fail" | "skipped";

export interface Step {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
}

const NPM_MIRROR = "https://registry.npmmirror.com";
const PIP_MIRROR = "https://pypi.tuna.tsinghua.edu.cn/simple";
const MAX_LOG = 3000;

function buildSteps(recipe: AgentRecipe): Step[] {
  const steps: Step[] = [];
  if (recipe.runtime !== "none") {
    steps.push({ id: "check-runtime", label: `检查 ${recipe.runtimeLabel}`, status: "pending" });
    steps.push({ id: "install-runtime", label: `安装 ${recipe.runtimeLabel}（winget）`, status: "pending" });
  }
  steps.push({ id: "install-agent", label: `安装 ${recipe.name}`, status: "pending" });
  if (recipe.env.length > 0) {
    steps.push({ id: "env", label: "写入密钥与环境变量", status: "pending" });
  }
  steps.push({ id: "verify", label: "验证安装", status: "pending" });
  return steps;
}

interface AgentStore {
  agentId: string | null;
  steps: Step[];
  running: boolean;
  finished: boolean;
  log: string[];
  envValues: Record<string, string>;
  useMirror: boolean;
  /** 自动检测到的已安装智能体（bin 探测 + 开始菜单匹配） */
  installedMap: Record<string, boolean>;
  detecting: boolean;
  detectInstalled: () => Promise<void>;
  open: (agentId: string) => void;
  close: () => void;
  reset: () => void;
  setEnv: (name: string, value: string) => void;
  setUseMirror: (v: boolean) => void;
  start: () => Promise<void>;
  launch: () => Promise<void>;
  /** 卸载本体（npm -g / pip / winget 三种渠道对应三种卸载；保留已写的密钥环境变量） */
  uninstall: () => Promise<void>;
}

function setStep(steps: Step[], id: string, patch: Partial<Step>): Step[] {
  return steps.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

export const useAgentStore = create<AgentStore>()((set, get) => ({
  agentId: null,
  steps: [],
  running: false,
  finished: false,
  log: [],
  envValues: {},
  useMirror: true,
  installedMap: {},
  detecting: false,

  /** 批量探测：CLI 型查 bin（npm 全局 / 已知位置 / where），桌面端查开始菜单 */
  detectInstalled: async () => {
    if (get().detecting) return;
    set({ detecting: true });
    try {
      const cli = useCatalogStore.getState().agents.filter((a) => !a.desktopNames);
      const gui = useCatalogStore.getState().agents.filter((a) => a.desktopNames);
      const [tools, startApps] = await Promise.all([
        ipc.checkTools(cli.map((a) => a.bin)),
        gui.length > 0 ? ipc.listStartApps() : Promise.resolve([]),
      ]);
      const bins = new Set(tools.filter((t) => t.installed).map((t) => t.name.toLowerCase()));
      const appNames = startApps.map((s) => s.name.toLowerCase());
      const map: Record<string, boolean> = {};
      for (const a of cli) map[a.id] = bins.has(a.bin.toLowerCase());
      for (const a of gui) {
        map[a.id] = a.desktopNames!.some((n) => appNames.some((x) => x.includes(n.toLowerCase())));
      }
      set({ installedMap: map });
    } catch {
      // 探测失败保持现状，不影响使用
    } finally {
      set({ detecting: false });
    }
  },

  open: (agentId) => {
    const recipe = useCatalogStore.getState().agents.find((a) => a.id === agentId);
    if (!recipe) return;
    const envValues: Record<string, string> = {};
    for (const e of recipe.env) envValues[e.name] = e.defaultValue ?? "";
    const installed = get().installedMap[agentId] === true;
    const steps = buildSteps(recipe);
    let log: string[] = [];
    if (installed) {
      // 已装：流水线直接标完成，落到「启动」这一步
      for (const s of steps) {
        s.status = "ok";
        if (s.id === "install-agent") s.detail = "已检测到本机安装";
        if (s.id === "install-runtime") s.detail = "已存在，跳过";
      }
      log = [`已检测到本机已安装 ${recipe.name}，可直接启动。`];
    }
    set({ agentId, steps, running: false, finished: installed, log, envValues });
    // 之前写过的密钥/端点从用户环境变量回填（不覆盖表单已有值）
    if (recipe.env.length > 0) {
      void ipc.getUserEnvs(recipe.env.map((e) => e.name)).then((envs) => {
        if (get().agentId !== agentId) return;
        const next = { ...get().envValues };
        for (const [k, v] of Object.entries(envs)) if (!next[k]?.trim()) next[k] = v;
        set({ envValues: next });
      });
    }
  },
  close: () => set({ agentId: null, steps: [], running: false, finished: false, log: [] }),
  /** 重新装机：流水线回到初始态（保留已填的密钥） */
  reset: () => {
    const recipe = useCatalogStore.getState().agents.find((a) => a.id === get().agentId);
    if (!recipe) return;
    set({ steps: buildSteps(recipe), running: false, finished: false, log: [] });
  },
  setEnv: (name, value) => set({ envValues: { ...get().envValues, [name]: value } }),
  setUseMirror: (v) => set({ useMirror: v }),

  start: async () => {
    const { agentId, envValues, useMirror } = get();
    const recipe = useCatalogStore.getState().agents.find((a) => a.id === agentId);
    if (!recipe || get().running) return;
    const task = useTaskStore.getState();
    set({ running: true, finished: false, log: [] });

    const upd = (id: string, patch: Partial<Step>) => set({ steps: setStep(get().steps, id, patch) });
    const fail = (id: string, detail: string) => {
      upd(id, { status: "fail", detail });
      set({ running: false });
    };

    try {
      // 1. 检查运行时
      if (recipe.runtime !== "none") {
        upd("check-runtime", { status: "running" });
        const runtimeName = recipe.runtime === "node" ? "node" : "python";
        let [st] = await ipc.checkTools([runtimeName]);
        if (st?.installed) {
          upd("check-runtime", { status: "ok", detail: st.version ?? st.path ?? "已安装" });
          upd("install-runtime", { status: "skipped", detail: "已存在，跳过" });
        } else {
          upd("check-runtime", { status: "ok", detail: "未安装" });
          upd("install-runtime", { status: "running" });
          const r = await task.runTask(`winget:runtime:${recipe.runtimeWinget}`, {
            kind: "winget",
            action: "install",
            wingetId: recipe.runtimeWinget!,
            display: `安装 ${recipe.runtimeLabel}`,
          });
          if (!r.success) return fail("install-runtime", `退出码 ${r.code}`);
          // 装完重新检测（宿主按已知位置解析，不依赖 PATH 刷新）
          [st] = await ipc.checkTools([runtimeName]);
          if (!st?.installed) return fail("install-runtime", "安装后仍未检测到，请重启本应用再试");
          upd("install-runtime", { status: "ok", detail: st.version ?? "完成" });
        }
      }

      // 2. 安装本体
      upd("install-agent", { status: "running" });
      let spec: TaskSpec;
      if (recipe.install.kind === "npm") {
        const args = ["install", "-g", recipe.install.package];
        if (useMirror) args.push(`--registry=${NPM_MIRROR}`);
        spec = {
          kind: "process",
          program: "npm",
          args,
          pathExtra: recipe.pathExtra,
          display: `npm 安装 ${recipe.name}`,
        };
      } else if (recipe.install.kind === "pip") {
        const args = ["-m", "pip", "install", recipe.install.package];
        if (useMirror) args.push("-i", PIP_MIRROR);
        spec = {
          kind: "process",
          program: "python",
          args,
          pathExtra: recipe.pathExtra,
          display: `pip 安装 ${recipe.name}`,
        };
      } else {
        spec = {
          kind: "winget",
          action: "install",
          wingetId: recipe.install.package,
          display: `安装 ${recipe.name}`,
        };
      }
      const r2 = await task.runTask(`agent:${recipe.id}:install`, spec);
      if (!r2.success) return fail("install-agent", `退出码 ${r2.code}`);
      upd("install-agent", { status: "ok" });

      // 3. 环境变量
      if (recipe.env.length > 0) {
        upd("env", { status: "running" });
        for (const e of recipe.env) {
          const v = envValues[e.name]?.trim();
          if (v) await ipc.setUserEnv(e.name, v);
        }
        upd("env", { status: "ok", detail: "新开的终端生效" });
      }

      // 4. 验证
      upd("verify", { status: "running" });
      if (recipe.desktopNames) {
        // 桌面端（GUI）：winget 静默安装路径因包而异，按开始菜单快捷方式核验
        const found = await ipc.findDesktopApp(recipe.desktopNames);
        upd("verify", found ? { status: "ok", detail: found } : { status: "ok", detail: "已安装（开始菜单可见）" });
      } else {
        const [bin] = await ipc.checkTools([recipe.bin]);
        if (bin?.installed) {
          upd("verify", { status: "ok", detail: bin.path ?? "就绪" });
        } else {
          upd("verify", { status: "ok", detail: "已安装（启动时按已知位置解析）" });
        }
      }
      set({ running: false, finished: true, installedMap: { ...get().installedMap, [recipe.id]: true } });
    } catch (e) {
      const runningStep = get().steps.find((s) => s.status === "running");
      fail(runningStep?.id ?? "install-agent", String(e));
    }
  },

  uninstall: async () => {
    const recipe = useCatalogStore.getState().agents.find((a) => a.id === get().agentId);
    if (!recipe || get().running) return;
    const task = useTaskStore.getState();
    set({ running: true, log: [`开始卸载 ${recipe.name}…`] });
    const done = async (ok: boolean, note: string) => {
      set({
        running: false,
        finished: false,
        steps: ok ? buildSteps(recipe) : get().steps,
        log: [...get().log, note],
      });
      // 重探测已安装状态（卡片徽章同步刷新）
      await get().detectInstalled();
    };
    try {
      if (recipe.install.kind === "winget") {
        // winget 本体（含桌面端）：真实卸载 + Geek 式残留扫描（弹层由 leftoverStore 接管）
        await deepUninstall(recipe.install.package, recipe.name);
        await done(true, `${recipe.name} 已卸载。装机时写入的密钥环境变量保留（可能与其他工具共享）。`);
        return;
      }
      const spec: TaskSpec =
        recipe.install.kind === "npm"
          ? {
              kind: "process",
              program: "npm",
              args: ["uninstall", "-g", recipe.install.package],
              pathExtra: recipe.pathExtra,
              display: `npm 卸载 ${recipe.name}`,
            }
          : {
              kind: "process",
              program: "python",
              args: ["-m", "pip", "uninstall", "-y", recipe.install.package],
              pathExtra: recipe.pathExtra,
              display: `pip 卸载 ${recipe.name}`,
            };
      const r = await task.runTask(`agent:${recipe.id}:uninstall`, spec);
      await done(
        r.success,
        r.success
          ? `${recipe.name} 已卸载。装机时写入的密钥环境变量保留（可能与其他工具共享）。`
          : `卸载失败（退出码 ${r.code}）`,
      );
    } catch (e) {
      await done(false, String(e));
    }
  },

  launch: async () => {
    const { agentId, envValues } = get();
    const recipe = useCatalogStore.getState().agents.find((a) => a.id === agentId);
    if (!recipe) return;
    const env: Record<string, string> = {};
    for (const e of recipe.env) {
      const v = envValues[e.name]?.trim();
      if (v) env[e.name] = v;
    }
    if (recipe.desktopNames) {
      // 桌面端（GUI）：经开始菜单 AppID 启动，无需知道 exe 落点
      await ipc.launchDesktopApp(recipe.desktopNames);
    } else {
      // CLI 型一键启动：内嵌终端（商店自己的窗口，ConPTY 直连子进程，
      // env/PATH 注入 100% 可靠——彻底绕开外部终端的解析怪癖）
      try {
        const id = `${recipe.id}-${Date.now().toString(36)}`;
        await ipc.termSpawn(id, {
          program: recipe.bin,
          args: recipe.launchArgs ?? [],
          env,
          pathExtra: recipe.pathExtra,
        });
        await ipc.openTerminalWindow(id, recipe.name);
        if (recipe.webPort) {
          // Web 型：等服务就绪再开浏览器（若此刻退出商店，setTimeout 会随窗口销毁）
          await new Promise((r) => setTimeout(r, 3000));
          await openUrl(`http://localhost:${recipe.webPort}`);
        }
      } catch (e) {
        // 失败必须可见（窗口权限/进程解析/PTY 创建任何一环出错都写到日志区）
        set({ log: [...get().log, `启动失败：${String(e)}`] });
        return;
      }
    }
    // 启动成功后：autoExit → 真正退出；否则窗口收进托盘常驻后台（随时从托盘唤回）
    if (useSettingsStore.getState().autoExit) {
      await ipc.quitApp();
    } else {
      await ipc.hideWindow();
    }
  },
}));

/** 流水线日志：把宿主任务事件流并入自己的累积日志（一次性接线）。 */
let logWired = false;
export function wireAgentLog(): () => void {
  if (logWired) return () => {};
  logWired = true;
  const un = listen<TaskLogEvent>("task-log", (e) => {
    useAgentStore.setState((s) => ({ log: [...s.log, ...e.payload.lines].slice(-MAX_LOG) }));
  });
  return () => {
    logWired = false;
    void un.then((f) => f());
  };
}
