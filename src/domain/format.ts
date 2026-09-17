/** 时间显示小工具（快照的"更新于 x 前"）。 */

export function timeLabel(atSecs: number): string {
  if (!atSecs) return "从未更新";
  const diff = Date.now() / 1000 - atSecs;
  if (diff < 60) return "刚刚更新";
  if (diff < 3600) return `更新于 ${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `更新于 ${Math.floor(diff / 3600)} 小时前`;
  return `更新于 ${Math.floor(diff / 86400)} 天前`;
}
