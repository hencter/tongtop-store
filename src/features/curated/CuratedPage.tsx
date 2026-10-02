/** 精选页（issue #26）：解决「日常用的软件不好找」。
 *
 *  和首页的区别：
 *  - 首页是工作台（状态 + 少量入口），只挑几款日常软件；
 *  - 这里是**按用途分组的完整精选清单**，每组给「装了几个 / 共几个」的进度，
 *    并把没装的排在前面 —— 目标就是让用户一眼看出「我还缺哪些日常软件」。
 *
 *  数据来自目录（内置 + 网站 API 实时更新），分组只存 winget ID（catalog/collections.ts），
 *  目录里没有的 ID 自动跳过，不会出现和网站两套描述。 */

import { memo, useEffect, useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, ChevronRight, Clock, Download, ExternalLink, LayoutGrid, Loader2, TrendingUp } from "lucide-react";
import { ESSENTIALS, CURATED_COLLECTIONS } from "../../catalog/collections";
import type { CatalogApp } from "../../catalog/apps";
import { useCatalogStore } from "../../state/catalogStore";
import { useAppStore } from "../../state/appStore";
import { useTaskStore } from "../../state/taskStore";
import { useDetailStore } from "../../state/detailStore";
import { useT } from "../../i18n";
import { AppIcon } from "../../components/AppIcon";
import { Chip } from "../../components/FilterChips";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Status = "none" | "installed" | "upgrade";

/** 精选页的紧凑软件行：一屏能看更多，状态一眼可辨（图标 + 名字 + 一句简介 + 状态/动作）。 */
const CuratedRow = memo(function CuratedRow({ app, status }: { app: CatalogApp; status: Status }) {
  const t = useT();
  const runTask = useTaskStore((s) => s.runTask);
  const silent = useTaskStore((s) => s.silent);
  const openDetail = useDetailStore((s) => s.open);
  const taskId = `winget:${status === "upgrade" ? "upgrade" : "install"}:${app.id}`;
  const taskState = useTaskStore((s) => s.taskState(taskId));

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2 transition-colors hover:bg-card">
      <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => openDetail(app.id)} title={t("查看详情")}>
        <AppIcon id={app.id} name={app.name} size={34} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 truncate text-[13px] font-semibold">
            {app.name}
            {status === "upgrade" && (
              <Badge variant="outline" className="border-primary/40 text-primary">
                <TrendingUp className="size-3" /> {t("可更新")}
              </Badge>
            )}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">{app.desc}</div>
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onClick={() => void openUrl(app.site)}
          title={app.site}
        >
          <ExternalLink className="size-3.5" />
        </button>
        {status === "installed" ? (
          <span className="inline-flex items-center gap-1 px-1 text-[11px] text-muted-foreground">
            <Check className="size-3.5 text-ok" /> {t("已安装")}
          </span>
        ) : (
          <Button
            size="sm"
            variant={status === "upgrade" ? "default" : "outline"}
            disabled={taskState !== null}
            onClick={() =>
              void runTask(taskId, {
                kind: "winget",
                action: status === "upgrade" ? "upgrade" : "install",
                wingetId: app.id,
                silent,
                display: `${status === "upgrade" ? "更新" : "安装"} ${app.name}`,
              })
            }
          >
            {taskState === "running" ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> {t("进行中")}
              </>
            ) : taskState === "queued" ? (
              <>
                <Clock className="size-3.5" /> {t("排队中")}
              </>
            ) : status === "upgrade" ? (
              <>
                <TrendingUp className="size-3.5" /> {t("更新")}
              </>
            ) : (
              <>
                <Download className="size-3.5" /> {t("安装")}
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
});

export function CuratedPage() {
  const t = useT();
  const CATALOG_BY_ID = useCatalogStore((s) => s.appsById);
  const installed = useAppStore((s) => s.installed);
  const upgrades = useAppStore((s) => s.upgrades);
  const setBrowseCategory = useAppStore((s) => s.setBrowseCategory);
  const setTab = useAppStore((s) => s.setTab);
  const [group, setGroup] = useState<string>("all");

  // 首次进入拉一次已安装/可更新快照（毫秒级 SQLite 读取，后台再刷新）
  useEffect(() => {
    void useAppStore.getState().loadSnapshot();
  }, []);

  const installedSet = useMemo(
    () => new Set((installed ?? []).map((a) => a.id.toLowerCase())),
    [installed],
  );
  const upgradeSet = useMemo(
    () => new Set((upgrades ?? []).map((u) => u.id.toLowerCase())),
    [upgrades],
  );
  const statusOf = (id: string): Status =>
    upgradeSet.has(id.toLowerCase()) ? "upgrade" : installedSet.has(id.toLowerCase()) ? "installed" : "none";

  /** 分组 → 目录里真实存在的软件（目录缺项自动跳过），未安装的排前面 */
  const groups = useMemo(() => {
    const resolve = (ids: string[]) =>
      ids
        .map((id) => CATALOG_BY_ID.get(id.toLowerCase()))
        .filter((a): a is CatalogApp => Boolean(a))
        .sort((a, b) => {
          const rank = (x: CatalogApp) => (upgradeSet.has(x.id.toLowerCase()) ? 0 : installedSet.has(x.id.toLowerCase()) ? 2 : 1);
          return rank(a) - rank(b) || a.name.localeCompare(b.name);
        });
    const all = [{ ...ESSENTIALS, apps: resolve(ESSENTIALS.ids) }];
    for (const c of CURATED_COLLECTIONS) all.push({ ...c, apps: resolve(c.ids) });
    return all;
  }, [CATALOG_BY_ID, installedSet, upgradeSet]);

  const shown = group === "all" ? groups : groups.filter((g) => g.id === group);
  const totalCount = groups.reduce((n, g) => n + g.apps.length, 0);
  const installedCount = groups.reduce(
    (n, g) => n + g.apps.filter((a) => installedSet.has(a.id.toLowerCase())).length,
    0,
  );
  const upgradeCount = groups.reduce(
    (n, g) => n + g.apps.filter((a) => upgradeSet.has(a.id.toLowerCase())).length,
    0,
  );
  // 一屏能列完时不折叠，避免为了看 12 个常用软件还要点两次
  const COLLAPSE_AT = 8;

  return (
    <div className="page flex h-full flex-col">
      <header className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="m-0 text-lg font-semibold tracking-wide">
            {t("精选软件")}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {t("已装 ")}
              {installed === null ? t("统计中…") : `${installedCount}/${totalCount}`}
              {upgradeCount > 0 && ` · ${upgradeCount}${t(" 个可更新")}`}
            </span>
          </h2>
          <p className="m-0 mt-0.5 text-[11.5px] text-muted-foreground">
            {t("日常真会用到的一批软件，按用途分组；没装的排在前面")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setTab("search")}>
            <LayoutGrid className="size-3.5" /> {t("浏览全部")}
          </Button>
        </div>
      </header>

      {/* 分组切换：单行横向滚动，窄窗口不折行 */}
      <div className="mb-3 flex shrink-0 items-center gap-1.5 overflow-x-auto scrollbar-none">
        <Chip active={group === "all"} onClick={() => setGroup("all")}>
          {t("全部")}
          <span className="text-[10.5px] opacity-70">{totalCount}</span>
        </Chip>
        {groups.map((g) => {
          const missing = g.apps.filter((a) => !installedSet.has(a.id.toLowerCase())).length;
          return (
            <Chip key={g.id} active={group === g.id} onClick={() => setGroup(g.id)} title={g.desc}>
              {t(g.label)}
              {installed !== null && missing > 0 && (
                <span className="text-[10.5px] opacity-70">{missing}</span>
              )}
            </Chip>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {shown.map((g) => {
          const collapsible = g.apps.length > COLLAPSE_AT;
          const missing = g.apps.filter((a) => !installedSet.has(a.id.toLowerCase())).length;
          const installedInGroup = g.apps.length - missing;
          const list = collapsible ? g.apps.slice(0, COLLAPSE_AT) : g.apps;
          return (
            <section key={g.id} className="mb-6">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="m-0 text-sm font-semibold tracking-wide">
                    {t(g.label)}
                    <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                      {installed === null ? t("统计中…") : `${installedInGroup}/${g.apps.length}`}
                    </span>
                  </h3>
                  <p className="m-0 mt-0.5 truncate text-[11px] text-muted-foreground">{t(g.desc)}</p>
                </div>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto shrink-0 p-0 text-xs text-muted-foreground"
                  onClick={() => {
                    setBrowseCategory(g.category);
                    setTab("search");
                  }}
                >
                  {t("在全部软件中查看")} <ChevronRight className="size-3.5" />
                </Button>
              </div>
              <div className="flex flex-col gap-1.5">
                {list.map((a) => (
                  <CuratedRow key={a.id} app={a} status={statusOf(a.id)} />
                ))}
                {collapsible && (
                  <button
                    className="mt-0.5 self-start rounded-md px-1 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => setGroup(g.id)}
                  >
                    {t("还有 ")}
                    {g.apps.length - list.length}
                    {t(" 个 —— 查看该组全部")}
                  </button>
                )}
              </div>
            </section>
          );
        })}
        <Card className="mt-2 flex items-center gap-3 bg-muted/40 p-3 text-[11.5px] text-muted-foreground">
          {t("精选只是编辑挑的日常软件清单，不代表个性化推荐；安装一律走 winget 官方源，商店不托管安装包。")}
        </Card>
      </div>
    </div>
  );
}
