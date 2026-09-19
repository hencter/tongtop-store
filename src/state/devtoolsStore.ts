/**
 * 包管理器检测：checkTools 批量探测 bin，版本随行显示。
 * 安装/卸载动作复用 taskStore / deepUninstall，完成后回这里重探测。
 */

import { create } from "zustand";
import { useCatalogStore } from "./catalogStore";
import * as ipc from "../ipc/client";
import type { ToolStatus } from "../ipc/types";

interface DevtoolsStore {
  /** bin → 探测结果 */
  status: Record<string, ToolStatus>;
  detecting: boolean;
  /** 首次进入自动探测一次；之后手动刷新或任务完成后重探测 */
  detect: () => Promise<void>;
}

export const useDevtoolsStore = create<DevtoolsStore>()((set, get) => ({
  status: {},
  detecting: false,
  detect: async () => {
    if (get().detecting) return;
    set({ detecting: true });
    try {
      const tools = await ipc.checkTools(useCatalogStore.getState().devtools.map((d) => d.bin));
      const status: Record<string, ToolStatus> = {};
      for (const t of tools) status[t.name.toLowerCase()] = t;
      set({ status });
    } catch {
      // 探测失败保持现状
    } finally {
      set({ detecting: false });
    }
  },
}));
