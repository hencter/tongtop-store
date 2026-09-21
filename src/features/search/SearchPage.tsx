/** 搜索/浏览页（issue #18）：可浏览的完整结果页。
 *  类型分 Tab：软件（默认，精选目录 + winget 官方源全量合并，不截断）/ AI 智能体 / 已安装 / 其他（镜像源）。
 *  软件 Tab 支持类别 / 安装状态 / 来源筛选；结果完整性明示（搜索中 / 失败 / 完成数量）。
 *  无搜索词时为「浏览全部软件」模式（首页分类入口带 browseCategory 落入此模式）。
 *  空结果给出清除筛选与浏览全部入口。 */

import { useEffect, useMemo, useState } from "react";
import { Bot, ListX, Zap } from "lucide-react";
import { useCatalogStore } from "../../state/catalogStore";
import { useT } from "../../i18n";
import { useAppStore } from "../../state/appStore";
import { useAgentStore } from "../../state/agentStore";
import type { CatalogApp } from "../../catalog/apps";
import type { AppInfo } from "../../ipc/types";
import { AppIcon } from "../../components/AppIcon";
import { AppRow } from "../../components/AppRow";
import { VirtualList } from "../../components/VirtualList";
import { PageTabs } from "../../components/PageTabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const ROW_H = 64;

type SearchTab = "apps" | "agents" | "installed" | "other";
type StatusFilter = "all" | "installed" | "upgrade" | "notInstalled";
type SourceFilter = "all" | "curated" | "winget";

interface SoftRow {
  key: string;
  info: AppInfo;
  catalog?: CatalogApp;
  source: "curated" | "winget";
}

export function SearchPage() {
  const t = useT();
  const query = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const results = useAppStore((s) => s.searchResults);
  const searching = useAppStore((s) => s.searching);
  const searchError = useAppStore((s) => s.searchError);
  const installed = useAppStore((s) => s.installed);
  const upgrades = useAppStore((s) => s.upgrades);
  const openAgent = useAgentStore((s) => s.open);
  const setTab = useAppStore((s) => s.setTab);
  // 目录数据（catalogStore 统一持有：内置 + 网站 API 实时更新）
  const CATALOG = useCatalogStore((s) => s.apps);
  const AGENTS = useCatalogStore((s) => s.agents);
  const CATEGORIES = useCatalogStore((s) => s.categories);
  const CATALOG_BY_ID = useCatalogStore((s) => s.appsById);
  const MIRROR_TOOLS = useCatalogStore((s) => s.mirrorTools);

  const [stab, setStab] = useState<SearchTab>("apps");
  // 类别筛选初值来自首页「按用途浏览」（消费后即清）
  const [cat, setCat] = useState<string>(
    () => useAppStore.getState().browseCategory ?? "all",
  );
  const [status, setStatus] = useState<StatusFilter>("all");
  const [source, setSource] = useState<SourceFilter>("all");

  useEffect(() => {
    if (useAppStore.getState().browseCategory !== null) {
      useAppStore.getState().setBrowseCategory(null);
    }
  }, []);

  const q = query.trim().toLowerCase();

  const installedSet = useMemo(
    () => new Set((installed ?? []).map((a) => a.id.toLowerCase())),
    [installed],
  );
  const upgradeSet = useMemo(
    () => new Set((upgrades ?? []).map((u) => u.id.toLowerCase())),
    [upgrades],
  );

  // ---------- 软件 Tab：精选目录 + winget 全量（不截断），类别/状态/来源筛选 ----------
  const curatedHits = useMemo(() => {
    let list = CATALOG;
    if (cat !== "all") {
      list = list.filter((a) =>
        cat === "ai" ? a.category === "ai" || a.ai === true : a.category === cat,
      );
    }
    if (q) {
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q) ||
          a.desc.toLowerCase().includes(q) ||
          a.tags?.some((tag) => tag.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [CATALOG, cat, q]);

  const wingetHits = useMemo(() => {
    if (!q) return [];
    const curated = new Set(curatedHits.map((a) => a.id.toLowerCase()));
    return (results ?? []).filter((a) => !curated.has(a.id.toLowerCase()));
  }, [curatedHits, results, q]);

  const softRows = useMemo(() => {
    const byStatus = (id: string) => {
      const lid = id.toLowerCase();
      if (status === "installed") return installedSet.has(lid);
      if (status === "upgrade") return upgradeSet.has(lid);
      if (status === "notInstalled") return !installedSet.has(lid);
      return true;
    };
    const rows: SoftRow[] = [];
    if (source !== "winget") {
      for (const a of curatedHits) {
        if (!byStatus(a.id)) continue;
        rows.push({ key: `c:${a.id}`, info: { name: a.name, id: a.id, version: "" }, catalog: a, source: "curated" });
      }
    }
    if (source !== "curated") {
      for (const a of wingetHits) {
        if (!byStatus(a.id)) continue;
        rows.push({ key: `w:${a.id}`, info: a, catalog: CATALOG_BY_ID.get(a.id.toLowerCase()), source: "winget" });
      }
    }
    return rows;
  }, [curatedHits, wingetHits, status, source, installedSet, upgradeSet, CATALOG_BY_ID]);

  // ---------- 其余类型 ----------
  const agentHits = useMemo(() => {
    if (!q) return AGENTS;
    return AGENTS.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.vendor.toLowerCase().includes(q) ||
        a.desc.toLowerCase().includes(q),
    );
  }, [AGENTS, q]);

  const installedHits = useMemo(() => {
    if (!q) return installed ?? [];
    return (installed ?? []).filter(
      (a) => a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q),
    );
  }, [installed, q]);

  const mirrorHits = useMemo(() => {
    if (!q) return [];
    return MIRROR_TOOLS.filter(
      (m) => m.name.toLowerCase().includes(q) || m.desc.toLowerCase().includes(q) || m.id.includes(q),
    );
  }, [MIRROR_TOOLS, q]);

  const clearFilters = () => {
    setCat("all");
    setStatus("all");
    setSource("all");
  };

  const wingetStatusLine = !q
    ? null
    : searching
      ? t("winget 官方源搜索中…（本地命中已就绪）")
      : searchError
        ? null
        : t("winget 官方源搜索完成");

  return (
    <div className="page flex h-full flex-col">
      <header className="mb-1.5 flex items-center justify-between">
        <h2 className="m-0 text-lg font-semibold tracking-wide">
          {q ? t("搜索：") + query.trim() : t("浏览全部软件")}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {stab === "apps" &&
              `${t("软件 ")}${softRows.length}${t(" 项")}${wingetStatusLine ? ` · ${wingetStatusLine}` : ""}`}
          </span>
        </h2>
        <PageTabs
          tabs={[
            { id: "apps" as const, label: t("软件"), count: stab === "apps" ? softRows.length : undefined },
            { id: "agents" as const, label: t("AI 智能体"), count: agentHits.length },
            { id: "installed" as const, label: t("已安装"), count: installed === null ? undefined : installedHits.length },
            { id: "other" as const, label: t("其他"), count: mirrorHits.length || undefined },
          ]}
          active={stab}
          onChange={setStab}
        />
      </header>

      {searchError && (
        <div className="mb-3 shrink-0 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-[13px] text-destructive">
          {t("winget 源搜索失败：")}{searchError}{t("（本地命中不受影响）")}
        </div>
      )}

      {stab === "apps" && (
        <>
          {/* 筛选栏：仅展示数据真实支持的条件（精选类别 / 安装状态 / 来源） */}
          <div className="mb-2 flex shrink-0 flex-wrap items-center gap-1.5">
            <Button variant={cat === "all" ? "default" : "outline"} size="sm" className="h-6 rounded-full px-2.5 text-xs" onClick={() => setCat("all")}>
              {t("全部")}
            </Button>
            {CATEGORIES.map((c) => (
              <Button key={c.id} variant={cat === c.id ? "default" : "outline"} size="sm" className="h-6 rounded-full px-2.5 text-xs" onClick={() => setCat(c.id)}>
                {t(c.label)}
              </Button>
            ))}
            <span className="mx-1 h-4 w-px bg-border" />
            {(
              [
                ["all", "全部状态"],
                ["installed", "已安装"],
                ["upgrade", "可更新"],
                ["notInstalled", "未安装"],
              ] as [StatusFilter, string][]
            ).map(([v, label]) => (
              <Button key={v} variant={status === v ? "default" : "outline"} size="sm" className="h-6 rounded-full px-2.5 text-xs" onClick={() => setStatus(v)}>
                {t(label)}
              </Button>
            ))}
            <span className="mx-1 h-4 w-px bg-border" />
            {(
              [
                ["all", "全部来源"],
                ["curated", "精选目录"],
                ["winget", "winget 源"],
              ] as [SourceFilter, string][]
            ).map(([v, label]) => (
              <Button key={v} variant={source === v ? "default" : "outline"} size="sm" className="h-6 rounded-full px-2.5 text-xs" onClick={() => setSource(v)}>
                {t(label)}
              </Button>
            ))}
          </div>

          {softRows.length === 0 && !searching ? (
            <div className="flex flex-col items-center gap-3 py-14 text-muted-foreground">
              <ListX className="size-7" />
              <div className="text-sm">
                {q ? <>{t("没有找到「")}{query.trim()}{t("」匹配的软件。")}</> : t("当前筛选条件下没有软件。")}
              </div>
              <div className="flex gap-2">
                {(cat !== "all" || status !== "all" || source !== "all") && (
                  <Button variant="outline" size="sm" onClick={clearFilters}>{t("清除筛选")}</Button>
                )}
                {q && (
                  <Button variant="outline" size="sm" onClick={() => setSearchQuery("")}>{t("浏览全部软件")}</Button>
                )}
              </div>
            </div>
          ) : (
            <VirtualList
              className="min-h-0 flex-1"
              items={softRows}
              rowHeight={ROW_H}
              renderRow={(row) => (
                <div className="relative">
                  {row.source === "winget" && (
                    <Badge variant="outline" className="absolute right-2 top-1 z-10 px-1 py-0 text-[9px] text-muted-foreground">
                      winget
                    </Badge>
                  )}
                  <AppRow info={row.info} catalog={row.catalog} mode="install" />
                </div>
              )}
            />
          )}
        </>
      )}

      {stab === "agents" && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {agentHits.length === 0 ? (
            <div className="py-14 text-center text-sm text-muted-foreground">{t("没有匹配的智能体。")}</div>
          ) : (
            agentHits.map((a) => (
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
                    setTab("agents");
                    openAgent(a.id);
                  }}
                >
                  <Bot className="size-3.5" /> {t("一键装机")}
                </Button>
              </div>
            ))
          )}
        </div>
      )}

      {stab === "installed" && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {installed === null ? (
            <div className="py-14 text-center text-sm text-muted-foreground">{t("统计中…")}</div>
          ) : installedHits.length === 0 ? (
            <div className="py-14 text-center text-sm text-muted-foreground">{t("没有匹配的已安装软件。")}</div>
          ) : (
            <VirtualList
              className="h-full"
              items={installedHits}
              rowHeight={ROW_H}
              renderRow={(a) => (
                <AppRow info={a} catalog={CATALOG_BY_ID.get(a.id.toLowerCase())} mode="uninstall" />
              )}
            />
          )}
        </div>
      )}

      {stab === "other" && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {mirrorHits.length === 0 ? (
            <div className="py-14 text-center text-sm text-muted-foreground">
              {q ? t("没有匹配的镜像源。") : t("输入关键词后，镜像源等设置命中会显示在这里。")}
            </div>
          ) : (
            mirrorHits.map((m) => (
              <div key={m.id} className="flex h-14 items-center gap-3 rounded-lg border border-transparent px-3 transition-colors hover:border-border hover:bg-card">
                <AppIcon id={`mirror:${m.id}`} name={m.name} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{m.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{m.desc}</div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setTab("mirrors")}>
                  <Zap className="size-3.5" /> {t("去配置")}
                </Button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
