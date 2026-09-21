/** 页内筛选框：只过滤当前页列表（与标题栏全局搜索职责分离，issue #16）。
 *  占位文案必须明示作用域（「筛选本页…」），不与全局搜索混淆。 */

import { Search, X } from "lucide-react";
import { useAppStore, type Tab } from "../state/appStore";
import { useT } from "../i18n";

export function PageFilter({ tab, placeholder }: { tab: Tab; placeholder: string }) {
  const t = useT();
  const value = useAppStore((s) => s.pageQueries[tab] ?? "");
  const setPageQuery = useAppStore((s) => s.setPageQuery);
  return (
    <div className="flex h-7 w-44 shrink-0 items-center gap-1.5 rounded-md border border-input bg-background px-2 text-muted-foreground transition-shadow focus-within:ring-2 focus-within:ring-ring/40">
      <Search className="size-3 shrink-0" />
      <input
        className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
        placeholder={t(placeholder)}
        value={value}
        onChange={(e) => setPageQuery(tab, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setPageQuery(tab, "");
        }}
      />
      {value && (
        <button
          className="shrink-0 rounded-full p-0.5 hover:bg-accent"
          onClick={() => setPageQuery(tab, "")}
          title={t("清空（Esc）")}
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}
