/**
 * 虚拟列表的纯计算部分（不依赖 React，可单测）。
 * mimenote 的招牌性能手段：固定行高 + overscan，
 * DOM 行数 = 可视行 + 2×overscan，与条目总数无关。
 */

export interface VirtualRange {
  /** 起始下标（含 overscan） */
  start: number;
  /** 结束下标（不含） */
  end: number;
  /** 渲染窗口的垂直偏移 px */
  offset: number;
  /** 总高度 px */
  total: number;
}

export function visibleRange(
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  count: number,
  overscan = 6,
): VirtualRange {
  if (count <= 0 || rowHeight <= 0) {
    return { start: 0, end: 0, offset: 0, total: 0 };
  }
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visible = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
  const end = Math.min(count, first + visible);
  return {
    start: first,
    end,
    offset: first * rowHeight,
    total: count * rowHeight,
  };
}
