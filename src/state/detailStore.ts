/** 详情弹层状态：winget show 与 GitHub Release 都按 ID 缓存，重复打开零 IPC。 */

import { create } from "zustand";
import * as ipc from "../ipc/client";
import type { AppDetail, GhRelease } from "../ipc/types";
import { useCatalogStore } from "./catalogStore";

const detailCache = new Map<string, AppDetail>();
const ghCache = new Map<string, GhRelease>();

interface DetailStore {
  detailId: string | null;
  detail: AppDetail | null;
  loading: boolean;
  error: string | null;
  /** GitHub 发布信息（仅目录里标了 github 的软件会拉取） */
  gh: GhRelease | null;
  ghLoading: boolean;
  ghError: string | null;
  open: (id: string) => Promise<void>;
  close: () => void;
}

export const useDetailStore = create<DetailStore>()((set) => ({
  detailId: null,
  detail: null,
  loading: false,
  error: null,
  gh: null,
  ghLoading: false,
  ghError: null,
  open: async (id) => {
    const key = id.toLowerCase();
    const cached = detailCache.get(key);
    const repo = useCatalogStore.getState().appsById.get(key)?.github;
    const ghCached = repo ? ghCache.get(repo) : null;
    set({
      detailId: id,
      detail: cached ?? null,
      loading: !cached,
      error: null,
      gh: ghCached ?? null,
      ghLoading: !!repo && !ghCached,
      ghError: null,
    });
    if (!cached) {
      ipc
        .appDetail(id)
        .then((d) => {
          detailCache.set(key, d);
          set((s) => (s.detailId === id ? { detail: d, loading: false } : s));
        })
        .catch((e) => set((s) => (s.detailId === id ? { loading: false, error: String(e) } : s)));
    }
    if (repo && !ghCached) {
      ipc
        .githubRelease(repo)
        .then((r) => {
          ghCache.set(repo, r);
          set((s) => (s.detailId === id ? { gh: r, ghLoading: false } : s));
        })
        .catch((e) => set((s) => (s.detailId === id ? { ghLoading: false, ghError: String(e) } : s)));
    }
  },
  close: () =>
    set({ detailId: null, detail: null, loading: false, error: null, gh: null, ghLoading: false, ghError: null }),
}));
