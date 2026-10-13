/** 热门榜。关闭匿名统计后不请求；请求失败时清空榜单，首页回到默认排序。 */

import { create } from "zustand";
import { reportInstall, topIds } from "../catalog/stats";
import * as ipc from "../ipc/client";
import { useSettingsStore } from "./settingsStore";

interface StatsStore {
  top: string[];
  refresh: () => Promise<void>;
  clear: () => void;
  reportInstall: (appId: string, version: string) => Promise<void>;
}

export const useStatsStore = create<StatsStore>()((set) => ({
  top: [],
  clear: () => set({ top: [] }),
  refresh: async () => {
    if (!useSettingsStore.getState().shareStats) {
      set({ top: [] });
      return;
    }
    const base = useSettingsStore.getState().catalogApi.trim();
    if (!base) {
      set({ top: [] });
      return;
    }
    try {
      set({ top: topIds(await ipc.statsFetch(base)) });
    } catch {
      set({ top: [] });
    }
  },
  reportInstall: async (appId, version) => {
    const settings = useSettingsStore.getState();
    const base = settings.catalogApi.trim();
    await reportInstall({
      share: settings.shareStats,
      appId,
      version,
      storage: localStorage,
      post: settings.shareStats && base ? (event) => ipc.statsReport(base, event) : undefined,
    });
  },
}));
