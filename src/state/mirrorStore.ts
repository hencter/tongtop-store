/** 镜像中心状态：检测 + 一键应用 + 傻瓜化自动测速（启动即后台跑，挑最快的自动应用）。 */

import { create } from "zustand";
import * as ipc from "../ipc/client";
import { MIRROR_TOOLS } from "../catalog/mirrors";
import type { MirrorStatus } from "../ipc/types";

/** 取镜像值的主机名（sparse+ 前缀与协议头剥掉），用于"当前源是否为它"的判断 */
function hostOf(v: string): string {
  return v.replace(/^sparse\+/, "").replace(/^https?:\/\//, "").split("/")[0];
}

interface MirrorStore {
  status: MirrorStatus[] | null;
  loading: boolean;
  applying: string | null; // tool id
  message: Record<string, string>;
  /** 各镜像 URL 的实测延迟（null = 不可达） */
  latencies: Record<string, number | null>;
  /** 自动测速进行中 */
  tuning: boolean;
  /** 上次自动测速时间戳（0 = 未跑过） */
  tunedAt: number;
  refresh: () => Promise<void>;
  apply: (tool: string, value: string) => Promise<void>;
  /** 傻瓜化一键：测全部 → 每个工具挑最快的自动应用（当前源不慢则不折腾） */
  autoTune: () => Promise<void>;
}

export const useMirrorStore = create<MirrorStore>()((set, get) => ({
  status: null,
  loading: false,
  applying: null,
  message: {},
  latencies: {},
  tuning: false,
  tunedAt: 0,
  refresh: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const status = await ipc.mirrorStatus(MIRROR_TOOLS.map((t) => t.id));
      set({ status, loading: false });
    } catch {
      set({ loading: false });
    }
  },
  apply: async (tool, value) => {
    set({ applying: tool, message: { ...get().message, [tool]: "" } });
    try {
      const msg = await ipc.mirrorApply(tool, value);
      set({
        applying: null,
        message: { ...get().message, [tool]: msg || "已应用" },
      });
      await get().refresh();
    } catch (e) {
      set({
        applying: null,
        message: { ...get().message, [tool]: String(e) },
      });
    }
  },
  autoTune: async () => {
    if (get().tuning) return;
    set({ tuning: true });
    try {
      // 1. 检测各工具当前源状态
      const status = await ipc.mirrorStatus(MIRROR_TOOLS.map((t) => t.id));
      set({ status });
      const tools = MIRROR_TOOLS.filter(
        (t) => !t.needsTool || status.find((s) => s.tool === t.id)?.installed,
      );
      // 2. 收集全部候选 URL（官方 + 预设）并行测速
      const urls = [
        ...new Set(
          tools.flatMap((t) => [t.official, ...t.presets.map((p) => p.value)]).filter(Boolean),
        ),
      ];
      const results = await ipc.mirrorLatencies(urls);
      const lat: Record<string, number | null> = {};
      for (const r of results) lat[r.url] = r.ms;
      // 3. 每个工具选最快；当前源不慢则保持（避免每次启动来回切）
      const msgs: Record<string, string> = {};
      for (const tool of tools) {
        const candidates = [tool.official, ...tool.presets.map((p) => p.value)]
          .filter(Boolean)
          .map((v) => ({ v, ms: lat[v] }))
          .filter((c): c is { v: string; ms: number } => c.ms != null);
        if (candidates.length === 0) continue;
        const best = candidates.reduce((a, b) => (a.ms <= b.ms ? a : b));
        const st = status.find((s) => s.tool === tool.id);
        const current = st?.current ?? "";
        const curMs = candidates.find((c) => current.includes(hostOf(c.v)))?.ms;
        if (curMs != null && curMs <= best.ms + 80) {
          msgs[tool.id] = `当前源已足够快（${curMs}ms）`;
          continue;
        }
        const label =
          tool.presets.find((p) => p.value === best.v)?.label ?? "官方源";
        try {
          await ipc.mirrorApply(tool.id, best.v);
          msgs[tool.id] = `已自动切换 → ${label}（${best.ms}ms）`;
        } catch (e) {
          msgs[tool.id] = `自动切换失败：${String(e)}`;
        }
      }
      // 4. 回读状态 + 落延迟表
      const status2 = await ipc.mirrorStatus(MIRROR_TOOLS.map((t) => t.id));
      set({
        status: status2,
        latencies: lat,
        tuning: false,
        tunedAt: Date.now(),
        message: { ...get().message, ...msgs },
      });
    } catch {
      set({ tuning: false });
    }
  },
}));
