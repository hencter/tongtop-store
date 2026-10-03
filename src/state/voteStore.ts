/**
 * 点赞 / 踩（本地优先，issue #27 反馈机制）。
 *
 * 分工：
 * - **官网**（web/）是云端计数的所有者：`/api/votes` 汇总全站票数、按 IP 防刷；
 * - **桌面端**落本地（localStorage）：离线可用、即刻反馈，不因站点未部署或断网而失效。
 *
 * 所以桌面端显示的是「本机票数」，并如实标注 —— 不假装是全站数据。
 * 站点部署后要接云端，只需在本文件加一次 fetch 并与 tally 合并。
 */

import { create } from "zustand";

const KEY = "tongtop.votes";

export type VoteValue = "up" | "down";

export interface Tally {
  up: number;
  down: number;
}

interface VoteRecord {
  /** 本机对某条目的投票（每个条目只能有一个方向） */
  mine: Record<string, VoteValue>;
  /** 本机累计票数 */
  tally: Record<string, Tally>;
}

function load(): VoteRecord {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<VoteRecord>;
    return {
      mine: parsed?.mine && typeof parsed.mine === "object" ? parsed.mine : {},
      tally: parsed?.tally && typeof parsed.tally === "object" ? parsed.tally : {},
    };
  } catch {
    return { mine: {}, tally: {} };
  }
}

interface VoteStore {
  mine: Record<string, VoteValue>;
  tally: Record<string, Tally>;
  /** 投票；对同一条目再点同一方向 = 撤销 */
  vote: (id: string, value: VoteValue) => void;
}

export const useVoteStore = create<VoteStore>()((set, get) => ({
  ...load(),
  vote: (id, value) => {
    const mine = { ...get().mine };
    const tally: Record<string, Tally> = { ...get().tally };
    const cur: Tally = { ...(tally[id] ?? { up: 0, down: 0 }) };
    const prev = mine[id];

    if (prev === value) {
      delete mine[id];
      cur[value] = Math.max(0, cur[value] - 1);
    } else {
      if (prev) cur[prev] = Math.max(0, cur[prev] - 1);
      mine[id] = value;
      cur[value] += 1;
    }
    tally[id] = cur;
    localStorage.setItem(KEY, JSON.stringify({ mine, tally }));
    set({ mine, tally });
  },
}));
