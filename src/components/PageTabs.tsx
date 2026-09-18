/** 页内分段 Tab（智能体 / 已安装页共用）：轻量分段控件，样式对齐侧边栏导航。 */

interface TabDef<K extends string> {
  id: K;
  label: string;
  /** 角标计数（如已安装数） */
  count?: number;
}

interface Props<K extends string> {
  tabs: TabDef<K>[];
  active: K;
  onChange: (id: K) => void;
  className?: string;
}

export function PageTabs<K extends string>({ tabs, active, onChange, className = "" }: Props<K>) {
  return (
    <div className={`inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5 ${className}`}>
      {tabs.map((t) => (
        <button
          key={t.id}
          className={`rounded-md px-3.5 py-1.5 text-xs transition-colors ${
            active === t.id
              ? "bg-background font-medium text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.count != null && <span className="ml-1 text-[10px] text-muted-foreground">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
