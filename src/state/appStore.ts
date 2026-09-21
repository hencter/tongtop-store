/**
 * 应用状态（Zustand）。
 *
 * 性能设计（对齐 mimenote 的做法）：
 * - 搜索：输入防抖 300ms + 请求序号守卫（过期响应直接丢弃）+
 *   查询级 LRU 缓存（同一关键词不再惊动 winget）；
 * - 已安装 / 可更新：首次进入才拉取（懒加载），之后用缓存，
 *   任务成功后自动失效重拉；
 * - 缓存放模块作用域（不进 zustand），避免大对象触发订阅通知。
 */

import { create } from "zustand";
import * as ipc from "../ipc/client";
import type { AppInfo, UpgradeInfo } from "../ipc/types";

export type Tab =
  | "home"
  | "search"
  | "agents"
  | "mirrors"
  | "installed"
  | "updates"
  | "cleanup"
  | "activity"
  | "github";

const SEARCH_CACHE_MAX = 50;
const searchCache = new Map<string, AppInfo[]>();

function cacheGet(q: string): AppInfo[] | undefined {
  const v = searchCache.get(q);
  if (v) {
    // LRU：命中即移到末尾
    searchCache.delete(q);
    searchCache.set(q, v);
  }
  return v;
}

function cacheSet(q: string, v: AppInfo[]) {
  searchCache.delete(q);
  searchCache.set(q, v);
  while (searchCache.size > SEARCH_CACHE_MAX) {
    const oldest = searchCache.keys().next().value;
    if (oldest === undefined) break;
    searchCache.delete(oldest);
  }
}

let searchSeq = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;

interface AppStore {
  tab: Tab;
  setTab: (t: Tab) => void;

  /** 首页「按用途浏览」带过来的目录分类筛选（搜索页消费后即清，issue #17/#18） */
  browseCategory: string | null;
  setBrowseCategory: (c: string | null) => void;

  /** 页面级搜索：每个路由独立的本地过滤词（互不影响） */
  pageQueries: Partial<Record<Tab, string>>;
  setPageQuery: (tab: Tab, q: string) => void;

  wingetOk: boolean | null;
  checkWinget: () => Promise<void>;

  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchResults: AppInfo[] | null;
  searching: boolean;
  searchError: string | null;
  runSearch: () => Promise<void>;

  installed: AppInfo[] | null;
  upgrades: UpgradeInfo[] | null;
  installedAt: number;
  upgradesAt: number;
  snapshotLoading: boolean;
  loadSnapshot: () => Promise<void>;
  refreshSnapshot: (force?: boolean) => Promise<void>;
}

export const useAppStore = create<AppStore>()((set, get) => ({
  tab: "home",
  setTab: (t) => {
    set({ tab: t });
    // 懒加载：第一次切到对应页才读快照（毫秒级），随后后台刷新
    if (t === "installed" || t === "updates") {
      void get()
        .loadSnapshot()
        .then(() => get().refreshSnapshot());
    }
  },

  browseCategory: null,
  setBrowseCategory: (c) => set({ browseCategory: c }),

  wingetOk: null,
  checkWinget: async () => {
    const ok = await ipc.wingetAvailable();
    set({ wingetOk: ok });
  },

  pageQueries: {},
  setPageQuery: (tab, q) => set({ pageQueries: { ...get().pageQueries, [tab]: q } }),

  searchQuery: "",
  setSearchQuery: (q) => {
    // 输入变化即清旧错误（zustand 同值 set 不会触发重渲染）
    set({ searchQuery: q, searchError: null });
    if (searchTimer) clearTimeout(searchTimer);
    if (!q.trim()) {
      set({ searchResults: null, searching: false });
      return;
    }
    searchTimer = setTimeout(() => void get().runSearch(), 300);
  },
  searchResults: null,
  searching: false,
  searchError: null,
  runSearch: async () => {
    // 回车直达：取消未触发的防抖，立即搜
    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = undefined;
    }
    const q = get().searchQuery.trim();
    if (!q) return;
    const key = q.toLowerCase();
    const hit = cacheGet(key);
    if (hit) {
      set({ searchResults: hit, searching: false, searchError: null });
      return;
    }
    const seq = ++searchSeq;
    set({ searching: true, searchError: null });
    try {
      const results = await ipc.searchApps(q);
      if (seq !== searchSeq) return; // 过期响应丢弃
      cacheSet(key, results);
      set({ searchResults: results, searching: false });
    } catch (e) {
      if (seq !== searchSeq) return;
      set({ searching: false, searchError: String(e) });
    }
  },

  installed: null,
  upgrades: null,
  installedAt: 0,
  upgradesAt: 0,
  snapshotLoading: false,
  /** 只读 SQLite（毫秒级）：首次进入页面时先拿这个渲染 */
  loadSnapshot: async () => {
    if (get().installed !== null) return;
    try {
      const s = await ipc.snapshotLoad();
      set({
        installed: s.installed,
        upgrades: s.upgrades,
        installedAt: s.installedAt,
        upgradesAt: s.upgradesAt,
      });
    } catch {
      set({ installed: [], upgrades: [] });
    }
  },
  /** 后台刷新（陈旧或 force 时才真跑 winget），结果回写界面 */
  refreshSnapshot: async (force = false) => {
    if (get().snapshotLoading) return;
    set({ snapshotLoading: true });
    try {
      const s = await ipc.snapshotRefresh(force);
      set({
        installed: s.installed,
        upgrades: s.upgrades,
        installedAt: s.installedAt,
        upgradesAt: s.upgradesAt,
      });
      // 提前拉取"可更新软件"的更新日志（winget show 本地进程，SQLite 落库，
      // 已缓存的自动跳过；不碰 GitHub API —— 它有匿名限流）
      if (s.upgrades.length > 0) {
        void ipc.prefetchReleaseNotes(s.upgrades.map((u: UpgradeInfo) => u.id));
      }
    } catch {
      // winget 暂时不可用：保持现有快照
    } finally {
      set({ snapshotLoading: false });
    }
  },
}));
