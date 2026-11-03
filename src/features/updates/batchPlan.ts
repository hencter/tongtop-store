/** 批量更新执行范围规划（纯函数，issue #23 回归测试对象）：
 *  原则：界面确认的清单与底层实际执行的任务完全一致；
 *  被忽略（永久 "*" / 精确版本）或被取消勾选的软件绝不会收到升级命令。
 */

import type { UpgradeInfo } from "../../ipc/types";

/** 按忽略规则拆分可见 / 已忽略（忽略规则：永久 "*" 或精确版本号命中） */
export function splitByIgnore(
  upgrades: readonly UpgradeInfo[],
  ignored: Readonly<Record<string, string>>,
): { visible: UpgradeInfo[]; hidden: UpgradeInfo[] } {
  const visible: UpgradeInfo[] = [];
  const hidden: UpgradeInfo[] = [];
  for (const u of upgrades) {
    const ig = ignored[u.id.toLowerCase()];
    if (ig === "*" || ig === u.available) hidden.push(u);
    else visible.push(u);
  }
  return { visible, hidden };
}

/** 实际批量执行清单 = 可见且未取消勾选（deselected 存小写 id；顺序与界面列表一致） */
export function planBatch(
  visible: readonly UpgradeInfo[],
  deselected: ReadonlySet<string>,
): UpgradeInfo[] {
  return visible.filter((u) => !deselected.has(u.id.toLowerCase()));
}

export type QueueItemState = "pending" | "prefetching" | "ready" | "running" | "success" | "failed";

/** 后台预取：当前项安装时最多再提前下载这么多个安装包。 */
export const PREFETCH_LOOKAHEAD = 2;

export type PrefetchState = "downloading" | "ready" | "failed";

/** 当前项之后、需要交给后台预取的 id（最多 LOOKAHEAD 个）。 */
export function upcomingPrefetchIds(
  queueIds: readonly string[],
  currentIndex: number,
  lookahead = PREFETCH_LOOKAHEAD,
): string[] {
  if (currentIndex < 0 || currentIndex >= queueIds.length) return [];
  return queueIds.slice(currentIndex + 1, currentIndex + 1 + lookahead);
}

/** 队列里某一项的状态：已出结果 / 正在跑 / 后台预取 / 还在后面排队 */
export function queueItemState(
  id: string,
  queueIds: readonly string[],
  results: Readonly<Record<string, "success" | "failed">>,
  doneCount: number,
  running: boolean,
  prefetch?: Readonly<Record<string, PrefetchState>>,
): QueueItemState | null {
  const result = results[id];
  if (result) return result;
  if (!running) return null;
  const idx = queueIds.indexOf(id);
  if (idx < 0) return null;
  if (idx === doneCount) return "running";
  if (idx > doneCount) {
    const p = prefetch?.[id] ?? prefetch?.[id.toLowerCase()];
    if (p === "downloading") return "prefetching";
    if (p === "ready") return "ready";
    return "pending";
  }
  return null;
}
