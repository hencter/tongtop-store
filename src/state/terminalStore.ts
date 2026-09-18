/**
 * 一键启动的终端检测：CLI 智能体启动前确保有 Windows Terminal。
 * 已装 → 直接经 wt 启动（多标签、渲染快、中文显示稳）；
 * 未装 → 弹窗建议：一键安装并启动 / 旧版控制台启动 / 取消（Promise 式等待用户选择）。
 */

import { create } from "zustand";
import * as ipc from "../ipc/client";
import { useTaskStore } from "./taskStore";

export type TerminalChoice = "wt" | "legacy" | "cancel";

const WT_WINGET = "Microsoft.WindowsTerminal";

let resolver: ((c: TerminalChoice) => void) | null = null;

interface TerminalStore {
  /** true 一旦确认过（wt 被卸载是小概率事件，不重复探测） */
  wtInstalled: boolean;
  /** 弹窗可见性：非 null 时为智能体名 */
  promptFor: string | null;
  installing: boolean;
  installError: string | null;
  detect: () => Promise<boolean>;
  /** 启动前调用：返回 "wt"（经 Windows Terminal）/ "legacy"（旧版控制台）/ "cancel"（放弃启动） */
  ensureTerminal: (agentName: string) => Promise<TerminalChoice>;
  choose: (c: TerminalChoice) => void;
  installAndContinue: () => Promise<void>;
}

export const useTerminalStore = create<TerminalStore>()((set, get) => ({
  wtInstalled: false,
  promptFor: null,
  installing: false,
  installError: null,

  detect: async () => {
    if (get().wtInstalled) return true;
    try {
      const [st] = await ipc.checkTools(["wt"]);
      if (st?.installed) {
        set({ wtInstalled: true });
        return true;
      }
    } catch {
      // 探测失败按未安装处理
    }
    return false;
  },

  ensureTerminal: async (agentName) => {
    if (await get().detect()) return "wt";
    if (resolver) resolver("cancel"); // 理论上不会并发，防御一下
    set({ promptFor: agentName, installError: null });
    return new Promise<TerminalChoice>((res) => {
      resolver = res;
    });
  },

  choose: (c) => {
    resolver?.(c);
    resolver = null;
    set({ promptFor: null, installError: null });
  },

  installAndContinue: async () => {
    if (get().installing) return;
    set({ installing: true, installError: null });
    try {
      const task = useTaskStore.getState();
      const r = await task.runTask(`winget:install:${WT_WINGET}`, {
        kind: "winget",
        action: "install",
        wingetId: WT_WINGET,
        silent: task.silent,
        display: "安装 Windows Terminal",
      });
      if (r.success && (await get().detect())) {
        resolver?.("wt");
        resolver = null;
        set({ promptFor: null, installing: false });
      } else {
        set({
          installing: false,
          installError: r.success
            ? "安装完成但未检测到 wt，请改用旧版控制台启动，或重启商店后重试"
            : `安装失败（退出码 ${r.code}），可改用旧版控制台启动`,
        });
      }
    } catch (e) {
      set({ installing: false, installError: String(e) });
    }
  },
}));
