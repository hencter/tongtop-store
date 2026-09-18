/** 软件行：搜索 / 已安装 / 更新三个页面共用（memo 化，长列表滚动不重渲染）。
 *  安装态感知：已安装 → 不再显示安装按钮；有官方更新或版本检测异常 → 安装按钮变更新按钮。
 *  更新行支持「忽略此版本 / 永久忽略」。
 *  卸载为真实卸载（winget uninstall + 残留扫描），点击需二次确认。
 */

import { memo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { BellOff, Clock, Download, ExternalLink, FileText, Loader2, Trash2, TrendingUp, X } from "lucide-react";
import type { CatalogApp } from "../catalog/apps";
import type { AppInfo } from "../ipc/types";
import { useTaskStore, MAX_QUEUE } from "../state/taskStore";
import { useAppStore } from "../state/appStore";
import { useSettingsStore } from "../state/settingsStore";
import { useDetailStore } from "../state/detailStore";
import { deepUninstall } from "../state/leftoverStore";
import { AppIcon } from "./AppIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type RowMode = "install" | "uninstall" | "upgrade";

interface Props {
  info: AppInfo;
  catalog?: CatalogApp;
  available?: string;
  mode: RowMode;
  /** 传入则显示"日志"按钮（更新页） */
  onNotes?: (id: string, name: string) => void;
}

export const AppRow = memo(function AppRow({ info, catalog, available, mode, onNotes }: Props) {
  const lid = info.id.toLowerCase();
  // 安装态感知（仅在安装模式查询快照；返回原始值，状态翻转才重渲染）
  const installedVersion = useAppStore((s) =>
    mode === "install" ? s.installed?.find((a) => a.id.toLowerCase() === lid)?.version : undefined,
  );
  const upgradeAvailable = useAppStore((s) =>
    mode === "install" ? s.upgrades?.find((u) => u.id.toLowerCase() === lid)?.available : undefined,
  );
  // 版本检测异常：本地已装版本 ≠ 源版本，但官方升级列表没有它 → 同样给更新入口
  const versionAnomaly =
    installedVersion != null && info.version !== "" && installedVersion !== info.version && !upgradeAvailable;
  const effectiveMode: RowMode =
    mode === "install" && (upgradeAvailable || versionAnomaly) ? "upgrade" : mode;
  const showInstalled = mode === "install" && installedVersion != null && effectiveMode === "install";
  const shownAvailable = available ?? upgradeAvailable ?? (versionAnomaly ? info.version : undefined);

  const taskId = `winget:${effectiveMode}:${info.id}`;
  const taskState = useTaskStore((s) => s.taskState(taskId));
  const uninstallTaskState = useTaskStore((s) => s.taskState(`winget:uninstall:${info.id}`));
  // 队列满与否合成一个布尔订阅：queue/running 的每次变化不再惊动所有行，
  // 只有结果翻转时该行才重渲染
  const queueFull = useTaskStore((s) => s.running !== null && s.queue.length >= MAX_QUEUE);
  const runTask = useTaskStore((s) => s.runTask);
  const silent = useTaskStore((s) => s.silent);
  const openDetail = useDetailStore((s) => s.open);
  const ignoreVersion = useSettingsStore((s) => s.ignoreVersion);
  const ignoreForever = useSettingsStore((s) => s.ignoreForever);
  const [ignoreOpen, setIgnoreOpen] = useState(false);
  const [confirmUninstall, setConfirmUninstall] = useState(false);

  const site = catalog?.site;
  const actionLabel = effectiveMode === "install" ? "安装" : effectiveMode === "upgrade" ? "更新" : "卸载";

  return (
    <div
      className={`flex h-16 items-center gap-3 rounded-lg border border-transparent px-3 transition-colors hover:border-border hover:bg-card ${
        taskState === "running" ? "border-border bg-accent" : ""
      }`}
    >
      <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => openDetail(info.id)} title="查看详情">
        <AppIcon id={info.id} name={catalog?.name ?? info.name} />
        <div className="min-w-0">
          <div className="flex items-center truncate font-semibold">
            {catalog?.name ?? info.name}
            {catalog && <Badge variant="secondary" className="ml-2">精选</Badge>}
            {catalog?.github && <Badge variant="outline" className="ml-1.5">GitHub</Badge>}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">{info.id}</div>
        </div>
      </button>
      <div className="w-32 shrink-0 text-right text-xs text-muted-foreground">
        {shownAvailable ? (
          <span className="inline-flex items-center gap-1">
            {installedVersion ?? info.version} <TrendingUp className="size-3" /> <span className="font-medium text-foreground">{shownAvailable}</span>
          </span>
        ) : (
          info.version || "—"
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        {confirmUninstall ? (
          <>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setConfirmUninstall(false);
                void deepUninstall(info.id, catalog?.name ?? info.name);
              }}
              title="真实卸载：winget 卸载后扫描注册表与 AppData 残留"
            >
              确认卸载
            </Button>
            <Button variant="ghost" size="icon" className="size-8" onClick={() => setConfirmUninstall(false)} title="取消">
              <X className="size-4" />
            </Button>
          </>
        ) : ignoreOpen ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                ignoreVersion(info.id, available ?? "");
                setIgnoreOpen(false);
              }}
              title={`忽略 ${available ?? "此"} 版本；再出新版会重新提醒`}
            >
              忽略此版本
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                ignoreForever(info.id);
                setIgnoreOpen(false);
              }}
              title="该软件的所有更新不再提醒"
            >
              永久忽略
            </Button>
            <Button variant="ghost" size="icon" className="size-8" onClick={() => setIgnoreOpen(false)} title="取消">
              <X className="size-4" />
            </Button>
          </>
        ) : (
          <>
            {onNotes && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNotes(info.id, catalog?.name ?? info.name)}
                title="查看更新日志"
              >
                <FileText className="size-3.5" /> 日志
              </Button>
            )}
            {mode === "upgrade" && (
              <Button variant="ghost" size="sm" onClick={() => setIgnoreOpen(true)} title="忽略此更新">
                <BellOff className="size-3.5" />
              </Button>
            )}
            {site && (
              <Button variant="outline" size="sm" onClick={() => void openUrl(site)} title={site}>
                <ExternalLink className="size-3.5" /> 官网
              </Button>
            )}
            {showInstalled ? (
              <Button
                variant="destructive"
                size="sm"
                disabled={uninstallTaskState !== null || queueFull}
                title="已安装 —— 点击卸载（需二次确认；卸载后扫描注册表与 AppData 残留）"
                onClick={() => setConfirmUninstall(true)}
              >
                {uninstallTaskState === "running" ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" /> 进行中
                  </>
                ) : uninstallTaskState === "queued" ? (
                  <>
                    <Clock className="size-3.5" /> 排队中
                  </>
                ) : (
                  <>
                    <Trash2 className="size-3.5" /> 卸载
                  </>
                )}
              </Button>
            ) : (
              <Button
                variant={effectiveMode === "uninstall" ? "destructive" : "default"}
                size="sm"
                disabled={taskState !== null || queueFull}
                title={queueFull ? "队列已满，请稍后再试" : undefined}
                onClick={() => {
                  if (effectiveMode === "uninstall") {
                    setConfirmUninstall(true);
                  } else {
                    void runTask(taskId, {
                      kind: "winget",
                      action: effectiveMode,
                      wingetId: info.id,
                      silent,
                      display: `${actionLabel} ${catalog?.name ?? info.name}`,
                    });
                  }
                }}
              >
                {taskState === "running" ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" /> 进行中
                  </>
                ) : taskState === "queued" ? (
                  <>
                    <Clock className="size-3.5" /> 排队中
                  </>
                ) : (
                  <>
                    {effectiveMode === "upgrade" ? (
                      <TrendingUp className="size-3.5" />
                    ) : (
                      <Download className="size-3.5" />
                    )}
                    {actionLabel}
                  </>
                )}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
});
