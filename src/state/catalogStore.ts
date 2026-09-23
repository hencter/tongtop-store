/**
 * 目录数据（首页推荐核心）：内置 data/*.json 秒开首屏，
 * 后台从网站静态 API 实时拉取最新推荐（agents/apps/categories）；
 * 拉取失败静默保留现状（离线可用）。schema 校验通过才整体切换，不半截更新。
 */

import { create } from "zustand";
import { CATALOG, CATEGORIES, type CatalogApp, type CategoryId } from "../catalog/apps";
import { AGENTS, sortAgents, type AgentRecipe } from "../catalog/agents";
import { DEVTOOLS, type DevTool } from "../catalog/devtools";
import { MIRROR_TOOLS, GH_PROXY_PRESETS, type MirrorPreset, type MirrorTool } from "../catalog/mirrors";
import * as ipc from "../ipc/client";
import { useSettingsStore } from "./settingsStore";

export type Category = { id: CategoryId; label: string };

/** 远程数据最小 schema 校验（防 404 HTML/半截 JSON 污染目录） */
function valid(d: ipc.CatalogDto): boolean {
  const okArr = (v: unknown, keys: string[]) =>
    Array.isArray(v) &&
    v.length > 0 &&
    keys.every((k) => typeof (v[0] as Record<string, unknown>)?.[k] === "string");
  return (
    okArr(d.apps, ["id", "name"]) &&
    okArr(d.agents, ["id", "name", "bin"]) &&
    okArr(d.categories, ["id", "label"]) &&
    okArr(d.devtools, ["id", "name", "bin"]) &&
    okArr(d.mirrors?.tools, ["id", "name"]) &&
    Array.isArray(d.mirrors?.ghProxies)
  );
}

interface CatalogStore {
  apps: CatalogApp[];
  agents: AgentRecipe[];
  categories: Category[];
  devtools: DevTool[];
  mirrorTools: MirrorTool[];
  ghProxyPresets: MirrorPreset[];
  /** id 小写 → app（派生索引，随数据切换重建） */
  appsById: ReadonlyMap<string, CatalogApp>;
  /** 远程数据更新时间（秒）；0 = 仍用内置数据 */
  updatedAt: number;
  source: "bundled" | "remote";
  refreshing: boolean;
  /** 上次发起拉取的时间戳（冷却用，模块内即可但放 store 便于调试） */
  lastFetchAt: number;
  refresh: (force?: boolean) => Promise<void>;
}

/** 下载用 GitHub 加速代理：用户设置的在前，其后是目录内置预设（去重、去掉「直连」空值） */
export function ghProxyList(): string[] {
  const user = useSettingsStore.getState().ghProxy.trim();
  const presets = useCatalogStore.getState().ghProxyPresets.map((p) => p.value.trim());
  return [...new Set([user, ...presets].filter((v) => v.startsWith("https://")))];
}

const bundledMap: ReadonlyMap<string, CatalogApp> = new Map(CATALOG.map((a) => [a.id.toLowerCase(), a]));

export const useCatalogStore = create<CatalogStore>()((set, get) => ({
  apps: CATALOG,
  agents: AGENTS,
  categories: CATEGORIES,
  devtools: DEVTOOLS,
  mirrorTools: MIRROR_TOOLS,
  ghProxyPresets: GH_PROXY_PRESETS,
  appsById: bundledMap,
  updatedAt: 0,
  source: "bundled",
  refreshing: false,
  lastFetchAt: 0,

  refresh: async (force = false) => {
    if (get().refreshing) return;
    // 冷却 5 分钟：进首页/切页频繁触发时不对站点造成压力
    if (!force && Date.now() - get().lastFetchAt < 5 * 60 * 1000) return;
    const base = useSettingsStore.getState().catalogApi.trim();
    if (!base) return; // 未配置 API：保持内置数据
    set({ refreshing: true, lastFetchAt: Date.now() });
    try {
      const d = await ipc.catalogFetch(base);
      if (!valid(d)) throw new Error("目录数据格式异常");
      const apps = d.apps as CatalogApp[];
      set({
        apps,
        agents: sortAgents(d.agents as AgentRecipe[]),
        categories: d.categories as Category[],
        devtools: d.devtools as DevTool[],
        mirrorTools: d.mirrors.tools as MirrorTool[],
        ghProxyPresets: d.mirrors.ghProxies as MirrorPreset[],
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
