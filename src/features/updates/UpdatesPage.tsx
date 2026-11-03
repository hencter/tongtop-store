/** 更新页：待更新软件排成队列（winget 同时只能跑一个）。
 *  勾选 = 入队，顺序与列表一致；开始后每行显示排队 / 预取 / 进行中 / 完成 / 失败。
 *  当前项安装时后台预取后面的安装包（LOOKAHEAD=2）。
 *  忽略机制：每行可「忽略此版本 / 永久忽略」，被忽略的进底部「已忽略」区。
 *  执行范围与确认清单完全一致（issue #23）。 */

import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, BellOff, CheckCircle2, Loader2, Pin, RefreshCw, Rocket, RotateCcw, XCircle } from "lucide-react";
import { useCatalogStore, ghProxyList } from "../../state/catalogStore";
import { useAppStore } from "../../state/appStore";
import { useTaskStore } from "../../state/taskStore";
import * as ipc from "../../ipc/client";
import { useNotesStore } from "../../state/notesStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useUpdateStore } from "../../state/updateStore";
import { timeLabel } from "../../domain/format";
import { AppLogo } from "../../components/AppLogo";
import { useT } from "../../i18n";
import { AppRow } from "../../components/AppRow";
import { PageFilter } from "../../components/PageFilter";
import { VirtualList } from "../../components/VirtualList";
import { planBatch, queueItemState, splitByIgnore, upcomingPrefetchIds } from "./batchPlan";
import type { UpgradeInfo } from "../../ipc/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ROW_H = 64;

interface BatchState {
  total: number;
  done: number;
  /** id（原始大小写）→ 结果 */
  results: Record<string, "success" | "failed">;
  running: boolean;
}

export function UpdatesPage() {
  const t = useT();
  const CATALOG_BY_ID = useCatalogStore((s) => s.appsById);
  const upgrades = useAppStore((s) => s.upgrades);
  const upgradesAt = useAppStore((s) => s.upgradesAt);
  const loading = useAppStore((s) => s.snapshotLoading);
  const refresh = useAppStore((s) => s.refreshSnapshot);
  const running = useTaskStore((s) => s.running);
  const prefetch = useTaskStore((s) => s.prefetch);
  const runTask = useTaskStore((s) => s.runTask);
  const silent = useTaskStore((s) => s.silent);
  const openNotes = useNotesStore((s) => s.open);
  const ignored = useSettingsStore((s) => s.ignored);
  const unignore = useSettingsStore((s) => s.unignore);
  const selfInfo = useUpdateStore((s) => s.info);
  const selfShow = useUpdateStore((s) => s.show);
  const selfCheck = useUpdateStore((s) => s.check);
  const [confirming, setConfirming] = useState(false);
  const [showIgnored, setShowIgnored] = useState(false);
  /** 取消勾选的 id（小写）；默认全部勾选，新出现的更新自动勾选 */
  const [deselected, setDeselected] = useState<ReadonlySet<string>>(new Set());
  const [batch, setBatch] = useState<BatchState | null>(null);

  // 商店自更新：启动时查过一次；进本页若尚无结果（失败/未完成）静默补一次
  useEffect(() => {
    if (!useUpdateStore.getState().info) void selfCheck(false);
  }, [selfCheck]);

  // 忽略规则：永久（"*"）或精确版本号命中即隐藏
  const { visible, hidden } = useMemo(
    () => splitByIgnore(upgrades ?? [], ignored),
    [upgrades, ignored],
  );

  const count = visible.length;

  // 标题栏搜索（本页作用域）：在可见更新里过滤名称 / ID
  const pageQuery = useAppStore((s) => s.pageQueries.updates ?? "");
  const q = pageQuery.trim().toLowerCase();
  const shown = q
    ? visible.filter(
        (u) => u.name.toLowerCase().includes(q) || u.id.toLowerCase().includes(q),
      )
    : visible;

  // 实际执行清单：可见且未取消勾选——确认弹窗与底层任务共用此结果，保证一致
  const selectedItems = useMemo(() => planBatch(visible, deselected), [visible, deselected]);

  const nameOf = (u: UpgradeInfo) => CATALOG_BY_ID.get(u.id.toLowerCase())?.name ?? u.name;

  const toggle = (id: string) => {
    if (batch?.running) return;
    const lid = id.toLowerCase();
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(lid)) next.delete(lid);
      else next.add(lid);
      return next;
    });
  };
  const selectAll = () => setDeselected(new Set());
  const selectNone = () => setDeselected(new Set(visible.map((u) => u.id.toLowerCase())));

  /** 逐项入队执行（队列串行，一次一项）；当前项安装时后台预取后面的安装包。失败不中断后续。 */
  const runBatch = async (items: UpgradeInfo[]) => {
    setConfirming(false);
    setBatch({ total: items.length, done: 0, results: {}, running: true });
    const proxies = ghProxyList();
    const ids = items.map((u) => u.id);
    for (let i = 0; i < items.length; i++) {
      const u = items[i];
      const upcoming = upcomingPrefetchIds(ids, i);
      if (upcoming.length > 0) void ipc.prefetchWinget(upcoming, proxies);
      let ok = false;
      try {
        const d = await runTask(`winget:upgrade:${u.id}`, {
          kind: "winget",
          action: "upgrade",
          wingetId: u.id,
          silent,
          display: `${t("更新")} ${nameOf(u)}`,
        });
        ok = d.success;
      } catch {
        ok = false;
      }
      setBatch((b) =>
        b
          ? { ...b, done: b.done + 1, results: { ...b.results, [u.id]: ok ? "success" : "failed" } }
          : b,
      );
    }
    setBatch((b) => (b ? { ...b, running: false } : b));
  };

  const failedItems = batch
    ? Object.keys(batch.results)
        .filter((id) => batch.results[id] === "failed")
        .map((id) => visible.find((u) => u.id === id) ?? upgrades?.find((u) => u.id === id))
        .filter((u): u is UpgradeInfo => !!u)
    : [];

  return (
    <div className="page flex h-full flex-col">
      <header className="mb-1.5 flex items-center justify-between">
        <h2 className="m-0 text-lg font-semibold tracking-wide">
          {t("可更新")}
          {upgrades ? `（${count}）` : ""}
          {batch?.running && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {t("队列进度")} {batch.done}/{batch.total}
              {running ? ` · ${running.label}` : ""}
              {Object.entries(prefetch)
                .filter(([, s]) => s === "downloading")
                .map(([id]) => CATALOG_BY_ID.get(id)?.name ?? visible.find((u) => u.id.toLowerCase() === id)?.name ?? id)
                .filter((name) => !running?.label.includes(name))
                .slice(0, 2)
                .map((name) => ` · ${t("后台预取")} ${name}`)
                .join("")}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          <PageFilter tab="updates" placeholder="筛选本页更新…" />
          <span className="text-[11px] text-muted-foreground">{timeLabel(upgradesAt)}</span>
          <Button variant="outline" size="sm" onClick={() => void refresh(true)} disabled={loading || batch?.running}>
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> {t("刷新")}
          </Button>
        </div>
      </header>

      {loading && !upgrades && (
        <div className="mt-2 flex flex-col gap-2.5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-[54px]" />
          ))}
        </div>
      )}

      {/* 商店自身更新：独立置顶区域，不与第三方软件混入批量操作 */}
      {selfInfo?.hasUpdate && (
        <div className="mb-3 flex h-16 shrink-0 items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 px-3">
          <AppLogo className="size-9 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 font-semibold">
              {t("通天路软件商店")}
              <Badge>
                <Pin className="size-3" /> {t("置顶")}
              </Badge>
            </div>
            <div className="truncate text-[11px] text-muted-foreground">{t("商店自身更新 · 静默安装并自动重启")}</div>
          </div>
          <div className="w-36 shrink-0 text-right text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              v{selfInfo.current} <Rocket className="size-3" />{" "}
              <span className="font-medium text-foreground">v{selfInfo.latest}</span>
            </span>
          </div>
          <Button size="sm" className="shrink-0" onClick={selfShow}>
            <Rocket className="size-3.5" /> {t("立即更新")}
          </Button>
        </div>
      )}

      {upgrades && count === 0 && (
        <div className="py-14 text-center text-muted-foreground">
          {hidden.length > 0 ? t("没有待处理的更新（部分已忽略）。") : t("所有软件都是最新版本。")}
        </div>
      )}

      {count > 0 && shown.length === 0 && (
        <div className="py-14 text-center text-muted-foreground">{t("没有匹配「")}{pageQuery.trim()}{t("」的待更新软件。")}</div>
      )}

      {shown.length > 0 && (
        <VirtualList
          className="min-h-0 flex-1"
          items={shown}
          rowHeight={ROW_H}
          renderRow={(info) => {
            const checked = !deselected.has(info.id.toLowerCase());
            const queueIds = selectedItems.map((u) => u.id);
            const qState = batch
              ? queueItemState(info.id, queueIds, batch.results, batch.done, batch.running, prefetch)
              : null;
            const pos = queueIds.indexOf(info.id);
            return (
              <div className="flex items-center gap-2 pr-1">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  disabled={batch?.running}
                  onClick={() => toggle(info.id)}
                  title={
                    qState === "prefetching"
                      ? t("后台预取")
                      : qState === "ready"
                        ? t("安装包已预取")
                        : checked
                          ? t("移出队列")
                          : t("加入队列")
                  }
                  className={`flex size-7 shrink-0 items-center justify-center rounded-md border text-[11px] font-medium tabular-nums transition-colors ${
                    qState === "running" || qState === "prefetching"
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : qState === "ready"
                        ? "border-ok/40 bg-ok/10 text-ok"
                        : qState === "success"
                          ? "border-ok/40 bg-ok/10 text-ok"
                          : qState === "failed"
                            ? "border-destructive/40 bg-destructive/10 text-destructive"
                            : checked
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/40 text-muted-foreground hover:border-muted-foreground"
                  } ${batch?.running ? "opacity-80" : ""}`}
                >
                  {qState === "running" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : qState === "prefetching" ? (
                    <ArrowDownToLine className="size-3.5 animate-pulse" />
                  ) : qState === "success" ? (
                    <CheckCircle2 className="size-3.5" />
                  ) : qState === "failed" ? (
                    <XCircle className="size-3.5" />
                  ) : qState === "ready" ? (
                    pos + 1
                  ) : checked ? (
                    pos + 1
                  ) : null}
                </button>
                <div className="min-w-0 flex-1">
                  <AppRow
                    info={{ name: info.name, id: info.id, version: info.version }}
                    available={info.available}
                    catalog={CATALOG_BY_ID.get(info.id.toLowerCase())}
                    mode="upgrade"
                    onNotes={(id, name) => void openNotes(id, name)}
                  />
                </div>
              </div>
            );
          }}
        />
      )}

      {/* 批量结果：成功/失败条目明示，失败可重试 */}
      {batch && !batch.running && (
        <div className="mt-2 shrink-0 rounded-lg border border-border bg-card px-3 py-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span>
              {t("本次更新：成功 ")}
              {Object.values(batch.results).filter((r) => r === "success").length}
              {failedItems.length > 0 && <span className="text-destructive">{t(" · 失败 ")}{failedItems.length}</span>}
            </span>
            <div className="flex gap-2">
              {failedItems.length > 0 && (
                <Button variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={() => void runBatch(failedItems)}>
                  <RotateCcw className="size-3" /> {t("重试失败项")}
                </Button>
              )}
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setBatch(null)}>
                {t("关闭")}
              </Button>
            </div>
          </div>
          {failedItems.length > 0 && (
            <div className="mt-1 text-destructive">
              {failedItems.map((u) => nameOf(u)).join("、")}
            </div>
          )}
        </div>
      )}

      {/* 队列操作栏：入队 N 项 / 全部入队 / 清空 / 开始队列 */}
      {count > 0 && (
        <div className="mt-2 flex shrink-0 items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <span className="text-xs text-muted-foreground">
            {t("队列 ")}{selectedItems.length}{t(" 项（共 ")}{count}{t(" 项待更新）")}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={batch?.running} onClick={selectAll}>
              {t("全部入队")}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={batch?.running} onClick={selectNone}>
              {t("清空")}
            </Button>
            <Button size="sm" className="h-7" disabled={selectedItems.length === 0 || batch?.running || running !== null} onClick={() => setConfirming(true)}>
              <Rocket className="size-3.5" /> {t("开始队列")}
            </Button>
          </div>
        </div>
      )}

      {hidden.length > 0 && (
        <div className="mt-3 shrink-0 border-t border-border pt-2.5">
          <button
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowIgnored((v) => !v)}
          >
            <BellOff className="size-3.5" /> {t("已忽略（")}{hidden.length}）{showIgnored ? t("收起") : t("展开")}
          </button>
          {showIgnored && (
            <div className="mt-2 flex flex-col gap-1">
              {hidden.map((u) => (
                <div key={u.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="min-w-0 flex-1 truncate">
                    {CATALOG_BY_ID.get(u.id.toLowerCase())?.name ?? u.name}
                    <span className="ml-1.5">
                      {u.version} → {u.available}
                      {ignored[u.id.toLowerCase()] === "*" ? t("（永久忽略）") : t("（已忽略此版本）")}
                    </span>
                  </span>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => unignore(u.id)}>
                    {t("恢复")}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="w-[440px]">
          <DialogHeader>
            <DialogTitle>{t("确认更新队列")}</DialogTitle>
            <DialogDescription>
              {t("将按下面顺序依次执行 winget upgrade（同时只能跑一个，共 ")}{selectedItems.length}{t(" 个）；未入队与已忽略的软件不会被更新。")}
              {selectedItems.length > 1 ? t("安装当前项时会后台下载队列里后面的安装包。") : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-48 overflow-y-auto p-4 pt-0">
            <ol className="m-0 flex flex-col gap-1.5 pl-5 text-[13px] text-muted-foreground">
              {selectedItems.map((u, i) => (
                <li key={u.id} className="truncate">
                  <span className="mr-1.5 tabular-nums text-foreground">{i + 1}.</span>
                  {nameOf(u)}
                  <span className="text-foreground"> {u.version} → {u.available}</span>
                </li>
              ))}
            </ol>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              {t("再想想")}
            </Button>
            <Button onClick={() => void runBatch(selectedItems)}>
              <Rocket className="size-3.5" /> {t("开始更新")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
