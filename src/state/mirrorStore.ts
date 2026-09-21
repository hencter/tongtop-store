/** 镜像中心状态（issue #21：测速与修改配置分离）。
 *  measure() 只测速出推荐（只读，绝不改配置）；
 *  applyRecommended() 才执行 mirrorApply——仅在用户显式开启「自动切换」后由启动/托盘流程调用，
 *  或在镜像页手动点「应用推荐」。
 *  逐工具的手动应用走 apply()（页面先弹变更预览确认）。 */

import { create } from "zustand";
import * as ipc from "../ipc/client";
import { useCatalogStore } from "./catalogStore";
import { useSettingsStore } from "./settingsStore";
import type { MirrorStatus } from "../ipc/types";

/** 取镜像值的主机名（sparse+ 前缀与协议头剥掉），用于"当前源是否为它"的判断 */
function hostOf(v: string): string {
  return v.replace(/^sparse\+/, "").replace(/^https?:\/\//, "").split("/")[0];
}

/** 测速推荐：某工具明显更快的候选源 */
export interface MirrorRecommendation {
  value: string;
  label: string;
  ms: number;
  /** 当前源实测延迟（null = 当前源不可达/不在候选中） */
  curMs: number | null;
}

interface MirrorStore {
  status: MirrorStatus[] | null;
  loading: boolean;
  applying: string | null; // tool id
  /** 各工具最近一次操作结果（ok=false 即失败，页面如实标红） */
  message: Record<string, { text: string; ok: boolean }>;
  /** 各镜像 URL 的实测延迟（null = 不可达） */
  latencies: Record<string, number | null>;
  /** 测速推荐（measure 产出，未经确认不会应用） */
  recommendations: Record<string, MirrorRecommendation>;
  /** 测速进行中 */
  tuning: boolean;
  /** 上次测速时间戳（0 = 未测过） */
  tunedAt: number;
  refresh: () => Promise<void>;
  apply: (tool: string, value: string) => Promise<void>;
  /** 只测速：检测状态 + 实测延迟 + 产出推荐，不修改任何配置 */
  measure: () => Promise<void>;
  /** 应用全部推荐（仅用户显式触发或已开启自动切换时调用） */
  applyRecommended: () => Promise<void>;
  /** 启动/托盘入口：先测速；仅在设置允许时才自动应用推荐 */
  autoTune: () => Promise<void>;
}

export const useMirrorStore = create<MirrorStore>()((set, get) => ({
  status: null,
  loading: false,
  applying: null,
  message: {},
  latencies: {},
  recommendations: {},
  tuning: false,
  tunedAt: 0,
  refresh: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const status = await ipc.mirrorStatus(useCatalogStore.getState().mirrorTools.map((t) => t.id));
      set({ status, loading: false });
    } catch {
      set({ loading: false });
    }
  },
  apply: async (tool, value) => {
    set({ applying: tool, message: { ...get().message, [tool]: { text: "", ok: true } } });
    try {
      const msg = await ipc.mirrorApply(tool, value);
      set({
        applying: null,
        message: { ...get().message, [tool]: { text: msg || "已应用", ok: true } },
        // 手动应用后该工具的推荐即过时（当前源已变）
        recommendations: Object.fromEntries(
          Object.entries(get().recommendations).filter(([k]) => k !== tool),
        ),
      });
      await get().refresh();
    } catch (e) {
      set({
        applying: null,
        message: { ...get().message, [tool]: { text: String(e), ok: false } },
      });
    }
  },
  measure: async () => {
    if (get().tuning) return;
    set({ tuning: true });
    try {
      // 1. 检测各工具当前源状态
      const status = await ipc.mirrorStatus(useCatalogStore.getState().mirrorTools.map((t) => t.id));
      set({ status });
      const tools = useCatalogStore.getState().mirrorTools.filter(
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
      // 3. 每个工具选最快；当前源不慢（差距 ≤80ms）则不给推荐（避免来回折腾）
      const recs: Record<string, MirrorRecommendation> = {};
      for (const tool of tools) {
        const candidates = [tool.official, ...tool.presets.map((p) => p.value)]
          .filter(Boolean)
          .map((v) => ({ v, ms: lat[v] }))
          .filter((c): c is { v: string; ms: number } => c.ms != null);
        if (candidates.length === 0) continue;
        const best = candidates.reduce((a, b) => (a.ms <= b.ms ? a : b));
        const st = status.find((s) => s.tool === tool.id);
        const current = st?.current ?? "";
        const curMs = candidates.find((c) => current.includes(hostOf(c.v)))?.ms ?? null;
        if (curMs != null && curMs <= best.ms + 80) continue;
        recs[tool.id] = {
          value: best.v,
          label: tool.presets.find((p) => p.value === best.v)?.label ?? "官方源",
          ms: best.ms,
          curMs,
        };
      }
      set({ latencies: lat, recommendations: recs, tuning: false, tunedAt: Date.now() });
    } catch {
      set({ tuning: false });
    }
  },
  applyRecommended: async () => {
    const recs = get().recommendations;
    for (const [tool, rec] of Object.entries(recs)) {
      await get().apply(tool, rec.value);
    }
  },
  autoTune: async () => {
    await get().measure();
    // 默认不自动修改任何工具的配置；用户显式开启后才自动应用推荐
    if (useSettingsStore.getState().autoSwitchMirrors) {
      await get().applyRecommended();
    }
  },
}));
