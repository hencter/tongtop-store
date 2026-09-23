/** 商店自更新：启动时静默检查 GitHub Releases，有新版本弹窗提示；
 *  立即更新 = 下载安装包 → 拉起安装器 → 退出本应用（安装器完成覆盖升级）。
 *  「忽略此版本」记住版本号，下一个新版本仍会提醒。
 */

import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import * as ipc from "../ipc/client";
import type { SelfUpdateInfo } from "../ipc/types";
import { ghProxyList } from "./catalogStore";

const SKIP_KEY = "tongtop.skipVersion";

interface UpdateStore {
  info: SelfUpdateInfo | null;
  /** 弹窗开关 */
  open: boolean;
  checking: boolean;
  /** 下载进度（null = 未在下载） */
  progress: number | null;
  /** 上次检查时间戳（前端节流用） */
  lastCheckAt: number;
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
  lastCheckAt: 0,

  check: async (manual = false) => {
    if (get().checking || get().progress !== null) return;
    set({ checking: true, error: null });
    try {
      // 手动检查必拉新；非手动（启动静默/进更新页）10 分钟节流后也拉新——
      // 刚发布的版本不能再被 6 小时缓存挡住（v0.6.5 实测踩坑）
      const force = manual || Date.now() - get().lastCheckAt > 10 * 60 * 1000;
      set({ lastCheckAt: Date.now() });
      const info = await ipc.checkSelfUpdate(force);
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
      // 官方地址与加速代理多线路并行下载——完整性由 minisign 验签（公钥内置）兜底，
      // 代理链路不可信也安全（issue #13 的解法）
      const path = await ipc.downloadSelfUpdate(info.assetUrl, ghProxyList(), info.assetSize);
      // 静默更新：watcher 接管（等退出 → 覆盖/安装 → 自动重启新版），本应用立即退出；
      // 完整性 fail closed：minisign 验签强制（≥0.6.3 的发布缺签名即拒绝），sha256 仅限老版本迁移窗口
      await ipc.applySelfUpdate(path, info.expectedSha256 ?? null, info.signature ?? null, info.latest, info.assetKind);
      set({ open: false });
      setTimeout(() => void ipc.quitApp(), 300);
    } catch (e) {
      set({ error: String(e), progress: null });
    } finally {
      un();
    }
  },
}));
