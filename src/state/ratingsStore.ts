/** 评分汇总：与索引站读取同一份 /api/data/ratings.json。失败时保持空表，界面显示「暂无评分」。 */

import { create } from "zustand";
import { parseRatings, type AppRating } from "../catalog/ratings";
import * as ipc from "../ipc/client";
import { useSettingsStore } from "./settingsStore";

interface RatingsStore {
  byId: ReadonlyMap<string, AppRating>;
  refresh: () => Promise<void>;
}

export const useRatingsStore = create<RatingsStore>()((set) => ({
  byId: new Map(),
  refresh: async () => {
    const base = useSettingsStore.getState().catalogApi.trim();
    if (!base) {
      set({ byId: new Map() });
      return;
    }
    try {
      const data = await ipc.ratingsFetch(base);
      set({ byId: parseRatings(data) });
    } catch {
      // 站点还没有这份数据、或网络失败：不把错误展示成评分。
    }
  },
}));
