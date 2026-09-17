/** 搜索页：纯渲染——输入统一走标题栏全局搜索框，这里只展示结果。
 *  精选目录即时命中（零延迟）+ winget 源结果（防抖 + 磁盘缓存）。 */

import { useMemo } from "react";
import { CATALOG, CATALOG_BY_ID } from "../../catalog/apps";
import { useAppStore } from "../../state/appStore";
import type { AppInfo } from "../../ipc/types";
import { AppRow } from "../../components/AppRow";
import { VirtualList } from "../../components/VirtualList";
import { Skeleton } from "@/components/ui/skeleton";

const ROW_H = 64;

export function SearchPage() {
  const query = useAppStore((s) => s.searchQuery);
  const results = useAppStore((s) => s.searchResults);
  const searching = useAppStore((s) => s.searching);
  const searchError = useAppStore((s) => s.searchError);

  const catalogHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return CATALOG.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        a.desc.toLowerCase().includes(q) ||
        a.tags?.some((t) => t.toLowerCase().includes(q)),
    );
  }, [query]);

  const merged = useMemo(() => {
    const byId = new Map((results ?? []).map((a) => [a.id.toLowerCase(), a]));
    const curatedIds = new Set(catalogHits.map((a) => a.id.toLowerCase()));
    const rows: { info: AppInfo; catalogId?: string }[] = [];
    for (const c of catalogHits) {
      const w = byId.get(c.id.toLowerCase());
      rows.push({ info: w ?? { name: c.name, id: c.id, version: "" }, catalogId: c.id });
    }
    for (const [lid, w] of byId) {
      if (!curatedIds.has(lid)) rows.push({ info: w, catalogId: CATALOG_BY_ID.get(lid)?.id });
    }
    return rows;
  }, [catalogHits, results]);

  const q = query.trim();

  return (
    <div className="page flex h-full flex-col">
      {searchError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-[13px] text-destructive">
          {searchError}
        </div>
      )}

      {!q && (
        <div className="py-14 text-center text-muted-foreground">
          在上方搜索框输入关键词开始搜索。精选目录即时命中；winget 官方源全量结果随后合并。
        </div>
      )}

      {q && merged.length === 0 && !searching && (
        <div className="py-14 text-center text-muted-foreground">没有找到「{q}」相关软件。</div>
      )}

      {q && (
        <VirtualList
          className="mt-1 min-h-0 flex-1"
          items={merged}
          rowHeight={ROW_H}
          renderRow={(row) => (
            <AppRow
              key={row.info.id}
              info={row.info}
              catalog={row.catalogId ? CATALOG_BY_ID.get(row.catalogId.toLowerCase()) : undefined}
              mode="install"
            />
          )}
        />
      )}

      {q && searching && (
        <div className="mt-3 flex flex-col gap-2.5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-[54px]" />
          ))}
        </div>
      )}
    </div>
  );
}
