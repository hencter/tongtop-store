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
