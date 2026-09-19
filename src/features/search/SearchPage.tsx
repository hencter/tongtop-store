/** 搜索页（全店联合搜索）：一个关键词搜遍所有页面域——
 *  精选目录 / AI 智能体 / 镜像源 / 已安装 / 可更新（均本地即时命中）
 *  + winget 官方源全量（防抖 + SQLite 缓存，异步合并）。
 *  每段封顶 5 条，「更多」跳到对应页面并带上该页的过滤词。 */

import { useMemo } from "react";
import { Bot, ChevronRight, Zap } from "lucide-react";
import { useCatalogStore } from "../../state/catalogStore";
import { MIRROR_TOOLS } from "../../catalog/mirrors";
import { useAppStore, type Tab } from "../../state/appStore";
import { useAgentStore } from "../../state/agentStore";
import { useNotesStore } from "../../state/notesStore";
import type { AppInfo } from "../../ipc/types";
import { AppIcon } from "../../components/AppIcon";
import { AppRow } from "../../components/AppRow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const CAP = 5;

function SectionHeader({
  title,
  count,
  onMore,
}: {
  title: string;
  count: number;
  onMore?: () => void;
}) {
  return (
    <div className="mb-2 mt-5 flex items-baseline justify-between first:mt-1">
      <h3 className="m-0 text-[13px] font-semibold tracking-wide text-muted-foreground">
        {title}（{count}）
      </h3>
      {onMore && count > CAP && (
        <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onMore}>
          更多 <ChevronRight className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

export function SearchPage() {
  const query = useAppStore((s) => s.searchQuery);
  const results = useAppStore((s) => s.searchResults);
  const searching = useAppStore((s) => s.searching);
  const searchError = useAppStore((s) => s.searchError);
  const installed = useAppStore((s) => s.installed);
  const upgrades = useAppStore((s) => s.upgrades);
  const setTab = useAppStore((s) => s.setTab);
  const setPageQuery = useAppStore((s) => s.setPageQuery);
  const openAgent = useAgentStore((s) => s.open);
  const openNotes = useNotesStore((s) => s.open);
  // 目录数据（catalogStore 统一持有：内置 + 网站 API 实时更新）
  const CATALOG = useCatalogStore((s) => s.apps);
  const AGENTS = useCatalogStore((s) => s.agents);
  const CATALOG_BY_ID = useCatalogStore((s) => s.appsById);

  const q = query.trim().toLowerCase();

  const go = (tab: Tab) => {
    setPageQuery(tab, query.trim());
    setTab(tab);
  };

  // ---------- 各域本地命中 ----------
  const catalogHits = useMemo(() => {
    if (!q) return [];
    return CATALOG.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        a.desc.toLowerCase().includes(q) ||
        a.tags?.some((t) => t.toLowerCase().includes(q)),
    );
  }, [q]);

  const agentHits = useMemo(() => {
    if (!q) return [];
    return AGENTS.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.vendor.toLowerCase().includes(q) ||
        a.desc.toLowerCase().includes(q),
    );
  }, [q]);

  const mirrorHits = useMemo(() => {
    if (!q) return [];
    return MIRROR_TOOLS.filter(
      (t) => t.name.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q) || t.id.includes(q),
    );
  }, [q]);

  const installedHits = useMemo(() => {
    if (!q) return [];
    return (installed ?? []).filter(
      (a) => a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q),
    );
  }, [q, installed]);

  const upgradeHits = useMemo(() => {
    if (!q) return [];
    return (upgrades ?? []).filter(
      (u) => u.name.toLowerCase().includes(q) || u.id.toLowerCase().includes(q),
    );
  }, [q, upgrades]);

  // winget 源结果（剔除已在精选段展示的 ID）
  const wingetRows = useMemo(() => {
    const curated = new Set(catalogHits.map((a) => a.id.toLowerCase()));
    return (results ?? []).filter((a) => !curated.has(a.id.toLowerCase()));
  }, [catalogHits, results]);

  const totalLocal =
    catalogHits.length + agentHits.length + mirrorHits.length + installedHits.length + upgradeHits.length;

  if (!q) {
    return (
      <div className="page flex h-full flex-col">
        <div className="py-14 text-center text-muted-foreground">
          在上方搜索框输入关键词 —— 一次搜遍精选软件、智能体、镜像源、已安装、可更新与 winget 官方源。
        </div>
      </div>
    );
  }

  return (
    <div className="page h-full overflow-y-auto">
      {searchError && (
        <div className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-[13px] text-destructive">
          {searchError}
        </div>
      )}

      {totalLocal === 0 && !searching && wingetRows.length === 0 && (
        <div className="py-14 text-center text-muted-foreground">没有找到「{query.trim()}」相关内容。</div>
      )}

      {catalogHits.length > 0 && (
        <section>
          <SectionHeader title="精选软件" count={catalogHits.length} onMore={() => go("home")} />
          {catalogHits.slice(0, CAP).map((a) => (
            <AppRow
              key={a.id}
              info={{ name: a.name, id: a.id, version: "" }}
              catalog={a}
              mode="install"
            />
          ))}
        </section>
      )}

      {agentHits.length > 0 && (
        <section>
          <SectionHeader title="AI 智能体" count={agentHits.length} onMore={() => go("agents")} />
          {agentHits.slice(0, CAP).map((a) => (
            <div key={a.id} className="flex h-14 items-center gap-3 rounded-lg border border-transparent px-3 transition-colors hover:border-border hover:bg-card">
              <AppIcon id={`agent:${a.id}`} name={a.name} size={34} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">
                  {a.name} <Badge variant="secondary" className="ml-1.5">{a.vendor}</Badge>
                </div>
                <div className="truncate text-[11px] text-muted-foreground">{a.desc}</div>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  go("agents");
                  openAgent(a.id);
                }}
              >
                <Bot className="size-3.5" /> 一键装机
              </Button>
            </div>
          ))}
        </section>
      )}

      {mirrorHits.length > 0 && (
        <section>
          <SectionHeader title="镜像源" count={mirrorHits.length} onMore={() => go("mirrors")} />
          {mirrorHits.slice(0, CAP).map((t) => (
            <div key={t.id} className="flex h-14 items-center gap-3 rounded-lg border border-transparent px-3 transition-colors hover:border-border hover:bg-card">
              <AppIcon id={`mirror:${t.id}`} name={t.name} size={30} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{t.name}</div>
                <div className="truncate text-[11px] text-muted-foreground">{t.desc}</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => go("mirrors")}>
                <Zap className="size-3.5" /> 去配置
              </Button>
            </div>
          ))}
        </section>
      )}

      {installedHits.length > 0 && (
        <section>
          <SectionHeader title="已安装" count={installedHits.length} onMore={() => go("installed")} />
          {installedHits.slice(0, CAP).map((a) => (
            <AppRow key={a.id} info={a} catalog={CATALOG_BY_ID.get(a.id.toLowerCase())} mode="uninstall" />
          ))}
        </section>
      )}

      {upgradeHits.length > 0 && (
        <section>
          <SectionHeader title="可更新" count={upgradeHits.length} onMore={() => go("updates")} />
          {upgradeHits.slice(0, CAP).map((u) => (
            <AppRow
              key={u.id}
              info={{ name: u.name, id: u.id, version: u.version }}
              available={u.available}
              catalog={CATALOG_BY_ID.get(u.id.toLowerCase())}
              mode="upgrade"
              onNotes={(id, name) => void openNotes(id, name)}
            />
          ))}
        </section>
      )}

      {(searching || wingetRows.length > 0) && (
        <section>
          <SectionHeader title="winget 官方源" count={wingetRows.length} />
          {wingetRows.slice(0, 8).map((a: AppInfo) => (
            <AppRow key={a.id} info={a} catalog={CATALOG_BY_ID.get(a.id.toLowerCase())} mode="install" />
          ))}
          {searching && (
            <div className="mt-2 flex flex-col gap-2.5">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-[54px]" />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
