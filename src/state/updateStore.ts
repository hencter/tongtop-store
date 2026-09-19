/** 商店自更新：启动时静默检查 GitHub Releases，有新版本弹窗提示；
 *  立即更新 = 下载安装包 → 拉起安装器 → 退出本应用（安装器完成覆盖升级）。
 *  「忽略此版本」记住版本号，下一个新版本仍会提醒。
 */

import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import * as ipc from "../ipc/client";
import type { SelfUpdateInfo } from "../ipc/types";

const SKIP_KEY = "tongtop.skipVersion";

interface UpdateStore {
  info: SelfUpdateInfo | null;
  /** 弹窗开关 */
  open: boolean;
  checking: boolean;
  /** 下载进度（null = 未在下载） */
  progress: number | null;
  error: string | null;
  /** manual=true 时无论有无更新都弹窗（设置里点「检查更新」） */
  check: (manual?: boolean) => Promise<void>;
  /** 打开更新弹窗（更新页置顶条目用） */
  show: () => void;
  dismiss: (skipVersion: boolean) => void;
  start: () => Promise<void>;
}

export const useUpdateStore = create<UpdateStore>()((set, get) => ({
  info: null,
  open: false,
  checking: false,
  progress: null,
  error: null,

  check: async (manual = false) => {
    if (get().checking || get().progress !== null) return;
    set({ checking: true, error: null });
    try {
      const info = await ipc.checkSelfUpdate();
      const skipped = localStorage.getItem(SKIP_KEY);
      const shouldShow = info.hasUpdate && (manual || info.latest !== skipped);
      set({ info, open: shouldShow || (manual && info.hasUpdate === false) });
    } catch (e) {
      // 静默检查失败不打扰（无仓库/限流/断网）；手动检查如实提示
      if (manual) set({ error: String(e), open: true });
    } finally {
      set({ checking: false });
    }
  },

  dismiss: (skipVersion) => {
    const info = get().info;
    if (skipVersion && info) localStorage.setItem(SKIP_KEY, info.latest);
    set({ open: false, error: null });
  },

  show: () => set({ open: true }),

  start: async () => {
    const info = get().info;
    if (!info?.assetUrl || get().progress !== null) return;
    set({ progress: 0, error: null });
    // 下载进度事件（一次性接线）
    const un = await listen<number>("self-update-progress", (e) => {
      set({ progress: e.payload });
    });
    try {
      // 自更新信任边界：永远直连官方 Release（latest slug），不经过第三方加速代理——
      // 代理链路返回的可执行内容没有任何完整性保证（issue #13），且另有 sha256 校验兜底。
      const path = await ipc.downloadSelfUpdate(info.assetUrl);
      // 静默更新：watcher 接管（等退出 → NSIS /S → 自动重启新版），本应用立即退出；
      // 有发布摘要时先过 sha256 校验（摘要走官方 API，与安装包同源 GitHub）
      await ipc.applySelfUpdate(path, info.expectedSha256 ?? null, info.latest, info.assetKind);
      set({ open: false });
      setTimeout(() => void ipc.quitApp(), 300);
    } catch (e) {
      set({ error: String(e), progress: null });
    } finally {
      un();
    }
  },
}));
