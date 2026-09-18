/**
 * GitHub 专区数据：目录里所有带 github 仓库的软件，批量拉最新 Release。
 * 结果按 repo 缓存（会话内重复进入零请求）；「刷新」强制重拉。
 * 注意 GitHub 匿名限流 60 次/小时，gh CLI 已认证则 5000 —— 故只在进入页面/手动刷新时拉。
 */

import { create } from "zustand";
import { CATALOG } from "../catalog/apps";
import * as ipc from "../ipc/client";
import type { GhRelease } from "../ipc/types";

export const GH_REPOS: { id: string; name: string; repo: string; desc: string }[] = CATALOG.filter(
  (a) => a.github,
).map((a) => ({ id: a.id, name: a.name, repo: a.github!, desc: a.desc }));

interface GithubZoneStore {
  releases: Record<string, GhRelease>;
  errors: Record<string, string>;
  loading: boolean;
  loadedOnce: boolean;
  fetchedAt: number;
  fetchAll: (force?: boolean) => Promise<void>;
}

export const useGithubZoneStore = create<GithubZoneStore>()((set, get) => ({
  releases: {},
  errors: {},
  loading: false,
  loadedOnce: false,
  fetchedAt: 0,
  fetchAll: async (force = false) => {
    if (get().loading) return;
    const repos = GH_REPOS.map((g) => g.repo).filter(
      (r) => force || (!get().releases[r] && !get().errors[r]),
    );
    if (repos.length === 0) return;
    set({ loading: true, ...(force ? { errors: {} } : {}) });
    const results = await Promise.allSettled(repos.map((r) => ipc.githubRelease(r)));
    const releases = { ...get().releases };
    const errors = { ...get().errors };
    results.forEach((res, i) => {
      const repo = repos[i];
      if (res.status === "fulfilled") {
        releases[repo] = res.value;
        delete errors[repo];
      } else {
        errors[repo] = String(res.reason);
      }
    });
    set({ releases, errors, loading: false, loadedOnce: true, fetchedAt: Date.now() });
  },
}));
