/**
 * 深度卸载（Geek Uninstaller 式）：winget 卸载 → 残留扫描（注册表 + AppData）→ 用户勾选清除。
 * deepUninstall 是唯一入口：行/卡片的「卸载」按钮都走它，判据只有一份。
 */

import { create } from "zustand";
import * as ipc from "../ipc/client";
import type { CleanReport, LeftoverReport, TaskDoneEvent } from "../ipc/types";
import { useTaskStore } from "./taskStore";

interface LeftoverStore {
  forId: string | null;
  forName: string;
  report: LeftoverReport | null;
  scanning: boolean;
  cleaning: boolean;
  result: CleanReport | null;
  checkedDirs: Record<string, boolean>;
  checkedKeys: Record<string, boolean>;
  scan: (id: string, name: string) => Promise<void>;
  toggleDir: (path: string) => void;
  toggleKey: (key: string) => void;
  clean: () => Promise<void>;
  close: () => void;
}

export const useLeftoverStore = create<LeftoverStore>()((set, get) => ({
  forId: null,
  forName: "",
  report: null,
  scanning: false,
  cleaning: false,
  result: null,
  checkedDirs: {},
  checkedKeys: {},
  scan: async (id, name) => {
    set({ forId: id, forName: name, report: null, scanning: true, result: null });
    try {
      const report = await ipc.leftoverScan(id, name);
      const checkedDirs: Record<string, boolean> = {};
      const checkedKeys: Record<string, boolean> = {};
      for (const d of report.dirs) checkedDirs[d.path] = true;
      for (const k of report.registry) checkedKeys[k.key] = true;
      set({ report, scanning: false, checkedDirs, checkedKeys });
    } catch {
      set({ scanning: false, report: { registry: [], dirs: [] } });
    }
  },
  toggleDir: (path) => set({ checkedDirs: { ...get().checkedDirs, [path]: !get().checkedDirs[path] } }),
  toggleKey: (key) => set({ checkedKeys: { ...get().checkedKeys, [key]: !get().checkedKeys[key] } }),
  clean: async () => {
    const { checkedDirs, checkedKeys } = get();
    const dirs = Object.keys(checkedDirs).filter((k) => checkedDirs[k]);
    const keys = Object.keys(checkedKeys).filter((k) => checkedKeys[k]);
    set({ cleaning: true });
    try {
      const result = await ipc.leftoverClean(dirs, keys);
      set({ result, cleaning: false });
    } catch {
      set({ cleaning: false });
    }
  },
  close: () => set({ forId: null, report: null, result: null, scanning: false, cleaning: false }),
}));

/** 卸载并扫描残留：返回任务结果（调用方按 success 判定，不得假定成功）。 */
export async function deepUninstall(id: string, name: string): Promise<TaskDoneEvent> {
  const task = useTaskStore.getState();
  const r = await task.runTask(`winget:uninstall:${id}`, {
    kind: "winget",
    action: "uninstall",
    wingetId: id,
    silent: task.silent,
    display: `卸载 ${name}`,
  });
  if (r.success) {
    void useLeftoverStore.getState().scan(id, name);
  }
  return r;
}
