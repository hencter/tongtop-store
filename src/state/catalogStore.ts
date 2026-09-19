/**
 * 目录数据（首页推荐核心）：内置 data/*.json 秒开首屏，
 * 后台从网站静态 API 实时拉取最新推荐（agents/apps/categories）；
 * 拉取失败静默保留现状（离线可用）。schema 校验通过才整体切换，不半截更新。
 */

import { create } from "zustand";
import { CATALOG, CATEGORIES, type CatalogApp, type CategoryId } from "../catalog/apps";
import { AGENTS, type AgentRecipe } from "../catalog/agents";
import * as ipc from "../ipc/client";
import { useSettingsStore } from "./settingsStore";

export type Category = { id: CategoryId; label: string };

/** 远程数据最小 schema 校验（防 404 HTML/半截 JSON 污染目录） */
function valid(d: ipc.CatalogDto): boolean {
  const okArr = (v: unknown, keys: string[]) =>
    Array.isArray(v) &&
    v.length > 0 &&
    keys.every((k) => typeof (v[0] as Record<string, unknown>)?.[k] === "string");
  return okArr(d.apps, ["id", "name"]) && okArr(d.agents, ["id", "name", "bin"]) && okArr(d.categories, ["id", "label"]);
}

interface CatalogStore {
  apps: CatalogApp[];
  agents: AgentRecipe[];
  categories: Category[];
  /** id 小写 → app（派生索引，随数据切换重建） */
  appsById: ReadonlyMap<string, CatalogApp>;
  /** 远程数据更新时间（秒）；0 = 仍用内置数据 */
  updatedAt: number;
  source: "bundled" | "remote";
  refreshing: boolean;
  refresh: () => Promise<void>;
}

const bundledMap: ReadonlyMap<string, CatalogApp> = new Map(CATALOG.map((a) => [a.id.toLowerCase(), a]));

export const useCatalogStore = create<CatalogStore>()((set, get) => ({
  apps: CATALOG,
  agents: AGENTS,
  categories: CATEGORIES,
  appsById: bundledMap,
  updatedAt: 0,
  source: "bundled",
  refreshing: false,

  refresh: async () => {
    if (get().refreshing) return;
    const base = useSettingsStore.getState().catalogApi.trim();
    if (!base) return; // 未配置 API：保持内置数据
    set({ refreshing: true });
    try {
      const d = await ipc.catalogFetch(base);
      if (!valid(d)) throw new Error("目录数据格式异常");
      const apps = d.apps as CatalogApp[];
      set({
        apps,
        agents: d.agents as AgentRecipe[],
        categories: d.categories as Category[],
        appsById: new Map(apps.map((a) => [a.id.toLowerCase(), a])),
        updatedAt: d.updatedAt,
        source: "remote",
        refreshing: false,
      });
    } catch {
      // 网络不可达 / 格式异常：静默保留现状
      set({ refreshing: false });
    }
  },
}));
