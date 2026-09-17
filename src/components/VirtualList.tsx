/**
 * 通用虚拟列表：固定行高 + overscan，DOM 行数与总数无关。
 * 只负责窗口计算与滚动，行渲染完全交给调用方。
 */

import { useEffect, useRef, useState, type ReactNode, type UIEvent } from "react";
import { visibleRange } from "../domain/virtualList";

interface Props<T> {
  items: T[];
  rowHeight: number;
  renderRow: (item: T, index: number) => ReactNode;
  className?: string;
  overscan?: number;
  empty?: ReactNode;
}

export function VirtualList<T>({ items, rowHeight, renderRow, className, overscan, empty }: Props<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);
  // rAF 节流：滚动事件频率远高于帧率，每帧最多重渲染一次
  const raf = useRef(0);
  const pendingTop = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
    ro.observe(el);
    setViewportH(el.clientHeight);
    return () => {
      ro.disconnect();
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    pendingTop.current = e.currentTarget.scrollTop;
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      setScrollTop(pendingTop.current);
    });
  };

  if (items.length === 0) {
    return <div className={className}>{empty}</div>;
  }

  const range = visibleRange(scrollTop, viewportH, rowHeight, items.length, overscan);
  const slice = items.slice(range.start, range.end);

  return (
    <div ref={ref} className={className} onScroll={onScroll} style={{ overflowY: "auto" }}>
      <div style={{ height: range.total, position: "relative" }}>
        <div style={{ transform: `translateY(${range.offset}px)` }}>
          {slice.map((item, i) => renderRow(item, range.start + i))}
        </div>
      </div>
    </div>
  );
}
