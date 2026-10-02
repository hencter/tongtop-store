/**
 * 窄窗口友好的筛选控件（issue #26）。
 *
 * 背景：浏览页原来把「类别 + 安装状态 + 来源」三组筛选全部平铺，窗口一窄就折成
 * 两三行、看得很累。这里给两个构件：
 *  - ChipRow：单行横向滚动 + 两端渐隐，永不换行、不挤压页面高度；
 *  - FilterPopover：把次要筛选收进一个下拉面板，触发器只显示「当前选中值」，
 *    占一个 chip 的宽度，窗宽再小也不塌。
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "../i18n";

/** 单行横向滚动容器：不换行，滚得动，两端渐隐提示还有内容。 */
export function ChipRow({
  children,
  className,
  resetKey,
}: {
  children: ReactNode;
  className?: string;
  /** 该值变化时把滚动位置拉回起点（切换 Tab / 清除筛选） */
  resetKey?: unknown;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const sync = () => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ left: el.scrollLeft > 1, right: max > 1 && el.scrollLeft < max - 1 });
  };

  useLayoutEffect(sync, [children, resetKey]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fade = (edge: boolean) =>
    edge
      ? "linear-gradient(90deg, transparent 0, #000 14px, #000 calc(100% - 14px), transparent 100%)"
      : undefined;
  const mask = edges.left && edges.right
    ? fade(true)
    : edges.left
      ? "linear-gradient(90deg, transparent 0, #000 14px)"
      : edges.right
        ? "linear-gradient(90deg, #000 calc(100% - 14px), transparent 100%)"
        : undefined;

  return (
    <div className={cn("relative min-w-0", className)}>
      <div
        ref={ref}
        onScroll={sync}
        className="flex scrollbar-none items-center gap-1.5 overflow-x-auto scroll-smooth py-0.5"
        style={{ maskImage: mask, WebkitMaskImage: mask }}
      >
        {children}
      </div>
    </div>
  );
}

/** 滚动行里的可选中 chip（分类用）。 */
export function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        active
          ? "border-transparent bg-primary font-medium text-primary-foreground"
          : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {children}
    </button>
  );
}

export interface PopoverOption<T extends string> {
  value: T;
  label: string;
  /** 选择该值时的结果条数（0 也照实显示） */
  count?: number;
}

/**
 * 下拉筛选：触发器显示当前值；面板里是单选列表。
 * 面板用 portal 挂到 body，避免被列表容器裁掉。
 */
export function FilterPopover<T extends string>({
  label,
  value,
  options,
  onChange,
  onReset,
  align = "start",
}: {
  /** 组名，用于面板标题与无障碍名称 */
  label: string;
  value: T;
  options: PopoverOption<T>[];
  onChange: (v: T) => void;
  /** 该组「未筛选」的取值；与 active 或重置按钮配合 */
  onReset?: () => void;
  align?: "start" | "end";
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const current = options.find((o) => o.value === value);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setRect(r);
  };

  useEffect(() => {
    if (!open) return;
    place();
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScroll = () => place();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const active = Boolean(current && current.value !== options[0]?.value);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`${label}：${current?.label ?? ""}`}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border px-3 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          active
            ? "border-primary/40 bg-primary/10 font-medium text-foreground"
            : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        )}
      >
        <span className="text-muted-foreground/70">{label}</span>
        <span className="max-w-[7.5rem] truncate">{current?.label ?? t("全部")}</span>
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
      </button>
      {open &&
        rect &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            aria-label={label}
            className="fixed z-50 min-w-[11rem] overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
            style={{
              top: rect.bottom + 6,
              left: align === "start" ? rect.left : Math.max(8, rect.right - 176),
            }}
          >
            <div className="px-2 py-1 text-[10.5px] font-medium tracking-wide text-muted-foreground">
              {label}
            </div>
            {options.map((o) => {
              const on = o.value === value;
              return (
                <button
                  key={o.value}
                  role="option"
                  aria-selected={on}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground",
                    on && "font-medium",
                  )}
                >
                  <Check className={cn("size-3.5 shrink-0", on ? "text-primary" : "opacity-0")} />
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.count !== undefined && (
                    <span className="shrink-0 text-[10.5px] tabular-nums text-muted-foreground">{o.count}</span>
                  )}
                </button>
              );
            })}
            {onReset && active && (
              <button
                onClick={() => {
                  onReset();
                  setOpen(false);
                }}
                className="mt-0.5 flex w-full cursor-pointer items-center gap-2 rounded-md border-t border-border px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <RotateCcw className="size-3.5 shrink-0" />
                {t("重置此项")}
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
