/** 已安装页（issue #22：聚焦本机软件管理）。
 *  「应用软件」：winget 快照（可更新/管理/卸载，卸载为次级操作 + 二次确认 + 残留扫描默认不勾选）。
 *  「开发环境」：仅展示实际检测到的本机包管理器/运行时；未安装工具的安装入口在软件搜索页。 */

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, Search, Trash2, TrendingUp, X, Zap } from "lucide-react";
import { useCatalogStore } from "../../state/catalogStore";
import { type DevTool } from "../../catalog/devtools";
import { useAppStore } from "../../state/appStore";
import { useDevtoolsStore } from "../../state/devtoolsStore";
import { useTaskStore } from "../../state/taskStore";
import { deepUninstall } from "../../state/leftoverStore";
import { timeLabel } from "../../domain/format";
import { AppIcon } from "../../components/AppIcon";
import { AppRow } from "../../components/AppRow";
import { PageFilter } from "../../components/PageFilter";
import { VirtualList } from "../../components/VirtualList";
import { PageTabs } from "../../components/PageTabs";
import { useT } from "../../i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const ROW_H = 64;

// ---------- 包管理器分栏 ----------

function DevToolRow({ tool }: { tool: DevTool }) {
  const t = useT();
  const status = useDevtoolsStore((s) => s.status[tool.bin.toLowerCase()]);
  const detect = useDevtoolsStore((s) => s.detect);
  const uninstallState = useTaskStore((s) => s.taskState(`winget:uninstall:${tool.winget}`));
  const setTab = useAppStore((s) => s.setTab);
  const [confirming, setConfirming] = useState(false);

  const uninstall = async () => {
    setConfirming(false);
    await deepUninstall(tool.winget, tool.name);
    void detect();
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border px-3.5 py-3">
      <AppIcon id={`tool:${tool.id}`} name={tool.name} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{tool.name}</span>
          <Badge variant="secondary">{tool.lang}</Badge>
        </div>
        <div className="truncate text-[11px] text-muted-foreground">
          {!status ? (
            "检测中…"
          ) : (
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="size-3 text-ok" /> {status.version ?? "已安装"}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        {confirming ? (
          <>
            <Button variant="destructive" size="sm" onClick={() => void uninstall()}>
              {t("确认卸载")}
            </Button>
            <Button variant="ghost" size="icon" className="size-8" onClick={() => setConfirming(false)} title="取消">
              <X className="size-4" />
            </Button>
          </>
        ) : (
          <>
            {tool.mirrorId && (
              <Button variant="outline" size="sm" onClick={() => setTab("mirrors")} title={t("前往镜像中心换国内源")}>
                <Zap className="size-3.5" /> 配置镜像
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={uninstallState !== null}
              title="卸载（需二次确认；卸载后扫描注册表与 AppData 残留）"
              onClick={() => setConfirming(true)}
            >
              {uninstallState === "running" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function DevtoolsPanel() {
  const t = useT();
  const status = useDevtoolsStore((s) => s.status);
  const detecting = useDevtoolsStore((s) => s.detecting);
  const detect = useDevtoolsStore((s) => s.detect);
  const tab = useAppStore((s) => s.tab);
  const setTab = useAppStore((s) => s.setTab);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const detected = Object.keys(status).length > 0;
  const devtools = useCatalogStore((s) => s.devtools);
  // issue #22：本页只展示实际检测到的本机工具；未安装的不混入「已安装」概念
  const installedTools = devtools.filter((d) => status[d.bin.toLowerCase()]?.installed);
  const missingCount = devtools.length - installedTools.length;

  // 每次切回本页都重新探测（keep-alive 下 useEffect 只在首次挂载跑，故监听 tab）
  useEffect(() => {
    if (tab === "installed") void detect();
  }, [tab, detect]);

  return (
    <>
      <div className="mb-2.5 flex items-center justify-between">
        <p className="m-0 text-xs text-muted-foreground">
          {t("本机已就位的包管理器与运行时（")}{installedTools.length}{t(" 个）。未安装的开发工具请到软件搜索页安装。")}
        </p>
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => void detect()} disabled={detecting}>
          <RefreshCw className={`size-3.5 ${detecting ? "animate-spin" : ""}`} /> {t("重新检测")}
        </Button>
      </div>
      {!detected && detecting ? (
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[60px]" />
          ))}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto">
          {installedTools.map((d) => (
            <DevToolRow key={d.id} tool={d} />
          ))}
          {detected && installedTools.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {t("未检测到本机包管理器 / 运行时。")}
            </div>
          )}
          {missingCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => {
                setSearchQuery("node");
                setTab("search");
              }}
            >
              <Search className="size-3.5" /> {t("去发现更多开发工具（")}{missingCount}{t(" 个可安装）")}
            </Button>
          )}
          <p className="m-0 py-1 text-[11px] leading-relaxed text-muted-foreground">
            {t("刚装完若仍显示未安装，点「重新检测」；部分工具需重开终端（或重启商店）才会进入 PATH。")}
          </p>
        </div>
      )}
    </>
  );
}

// ---------- 页面 ----------

export function InstalledPage() {
  const t = useT();
  const installed = useAppStore((s) => s.installed);
  const installedAt = useAppStore((s) => s.installedAt);
  const upgrades = useAppStore((s) => s.upgrades);
  const loading = useAppStore((s) => s.snapshotLoading);
  const refresh = useAppStore((s) => s.refreshSnapshot);
  const setTab = useAppStore((s) => s.setTab);
  const pageQuery = useAppStore((s) => s.pageQueries.installed ?? "");
  const CATALOG_BY_ID = useCatalogStore((s) => s.appsById);
  const [section, setSection] = useState<"apps" | "devtools">("apps");

  // 标题栏搜索（本页作用域）：本地过滤名称 / ID
  const q = pageQuery.trim().toLowerCase();
  const shown = q
    ? (installed ?? []).filter(
        (a) => a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q),
      )
    : installed;

  return (
    <div className="page flex h-full flex-col">
      <header className="mb-1.5 flex items-center justify-between">
        <h2 className="m-0 text-lg font-semibold tracking-wide">
          {t("已安装")}{section === "apps" && installed ? `（${installed.length}）` : ""}
        </h2>
        <div className="flex items-center gap-3">
          {section === "apps" && <PageFilter tab="installed" placeholder="筛选本页已安装…" />}
          {section === "apps" && upgrades !== null && upgrades.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setTab("updates")} title={t("前往软件更新")}>
              <TrendingUp className="size-3.5 text-primary" /> {t("可更新 ")}{upgrades.length}
            </Button>
          )}
          <PageTabs
            tabs={[
              { id: "apps" as const, label: t("应用软件"), count: installed?.length },
              { id: "devtools" as const, label: t("开发环境") },
            ]}
            active={section}
            onChange={setSection}
          />
          {section === "apps" && (
            <>
              <span className="text-[11px] text-muted-foreground">{timeLabel(installedAt)}</span>
              <Button variant="outline" size="sm" onClick={() => void refresh(true)} disabled={loading}>
                <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> {t("刷新")}
              </Button>
            </>
          )}
        </div>
      </header>

      {section === "devtools" ? (
        <DevtoolsPanel />
      ) : (
        <>
          <p className="mb-2.5 text-xs text-muted-foreground">
            {t("仅列出与 winget 源关联的软件（可由此更新/卸载，卸载需二次确认）。数据来自本地快照索引，毫秒级加载。")}
          </p>

          {loading && !installed && (
            <div className="mt-2 flex flex-col gap-2.5">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-[54px]" />
              ))}
            </div>
          )}

          {installed && installed.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-14 text-muted-foreground">
              <span>{t("当前仅能识别与 winget 源关联的软件，暂未检测到。")}</span>
              <Button variant="outline" size="sm" onClick={() => setTab("search")}>
                <Search className="size-3.5" /> {t("去软件搜索发现并安装")}
              </Button>
            </div>
          )}

          {shown && shown.length === 0 && (installed?.length ?? 0) > 0 && (
            <div className="py-14 text-center text-muted-foreground">{t("没有匹配「")}{pageQuery.trim()}{t("」的已安装软件。")}</div>
          )}

          {shown && shown.length > 0 && (
            <VirtualList
              className="min-h-0 flex-1"
              items={shown}
              rowHeight={ROW_H}
              renderRow={(info) => (
                <AppRow
                  key={info.id}
                  info={info}
                  catalog={CATALOG_BY_ID.get(info.id.toLowerCase())}
                  mode="uninstall"
                />
              )}
            />
          )}
        </>
      )}
    </div>
  );
}
