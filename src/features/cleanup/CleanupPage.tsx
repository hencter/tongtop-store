/** 安装包缓存清理页（issue #24：名称与范围一致）。
 *  范围仅 winget 安装时下载到临时目录（%TEMP%\WinGet）的安装包副本——
 *  不清理系统垃圾、浏览器缓存或其他软件缓存；删除不影响已安装的软件。
 *  结果区分预计/实际释放，跳过项如实标注；清理后自动重新扫描。 */

import { useCallback, useEffect, useState } from "react";
import { BrushCleaning, CheckCircle2, FolderOpen, Loader2, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import * as ipc from "../../ipc/client";
import type { CleanupInfo, CleanupResult } from "../../ipc/types";
import { formatSize } from "../../domain/github";
import { useAppStore } from "../../state/appStore";
import { useT } from "../../i18n";
import { PageFilter } from "../../components/PageFilter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function CleanupPage() {
  const t = useT();
  const [info, setInfo] = useState<CleanupInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<CleanupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scannedAt, setScannedAt] = useState(0);
  const pageQuery = useAppStore((s) => s.pageQueries.cleanup ?? "");

  // 标题栏搜索（本页作用域）：过滤占用明细
  const q = pageQuery.trim().toLowerCase();
  const shownItems = q ? (info?.items ?? []).filter((it) => it.name.toLowerCase().includes(q)) : (info?.items ?? []);

  const scan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setInfo(await ipc.cleanupScan());
      setScannedAt(Date.now());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void scan();
  }, [scan]);

  const blocked = !!info && (info.wingetRunning || info.taskRunning);
  const empty = !!info && info.totalBytes === 0;

  const run = async () => {
    setConfirming(false);
    setCleaning(true);
    setError(null);
    try {
      const r = await ipc.cleanupRun();
      setResult(r);
      await scan();
    } catch (e) {
      setError(String(e));
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="page h-full overflow-y-auto">
      <header className="mb-1.5 flex items-center justify-between">
        <h2 className="m-0 text-lg font-semibold tracking-wide">{t("安装包缓存清理")}</h2>
        <div className="flex items-center gap-2">
          <PageFilter tab="cleanup" placeholder="筛选本页缓存项…" />
          <Button variant="outline" size="sm" onClick={() => void scan()} disabled={loading}>
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> 重新检查
          </Button>
        </div>
      </header>
      <p className="mb-4 text-xs text-muted-foreground">
        {t("范围仅限 winget 安装软件时下载到临时目录的安装包副本——不清理系统垃圾、浏览器缓存或其他软件的缓存。")}
        {scannedAt > 0 && <span className="ml-1">{t("最近扫描：")}{new Date(scannedAt).toLocaleTimeString()}</span>}
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-[13px] text-destructive">
          {error}
        </div>
      )}

      {result && (
        <div
          className={`mb-4 flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-[13px] ${
            result.skipped > 0
              ? "border-gold/40 bg-gold/10 text-gold"
              : "border-ok/40 bg-ok/10 text-ok"
          }`}
        >
          <CheckCircle2 className="size-4" />
          实际释放 {formatSize(result.freedBytes)}（删除 {result.deleted} 项
          {result.skipped > 0 ? `，${result.skipped} 项正被占用已跳过（未删除）` : ""}）
        </div>
      )}

      {loading && !info && <Skeleton className="h-40" />}

      {info && (
        <>
          <Card className="mb-3 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">{formatSize(info.totalBytes)}</span>
                  {blocked ? (
                    <Badge variant="destructive">
                      <ShieldAlert className="size-3" /> 有任务进行中
                    </Badge>
                  ) : empty ? (
                    <Badge variant="ok">很干净</Badge>
                  ) : (
                    <Badge variant="secondary">可安全清理</Badge>
                  )}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {info.fileCount} 个文件 · {info.dirCount} 个目录
                </div>
                <div className="mt-1 flex items-center gap-1.5 truncate font-mono text-[11px] text-muted-foreground" title={info.dir}>
                  <FolderOpen className="size-3 shrink-0" /> {info.dir}
                </div>
                {info.wingetRunning && (
                  <div className="mt-2 text-[11px] text-destructive">系统里有 winget 正在运行，为避免破坏安装暂不能清理</div>
                )}
                {!info.wingetRunning && info.taskRunning && (
                  <div className="mt-2 text-[11px] text-destructive">本应用有安装任务进行中，完成后再清理</div>
                )}
              </div>
              <Button
                size="lg"
                disabled={blocked || empty || cleaning}
                onClick={() => setConfirming(true)}
              >
                {cleaning ? <Loader2 className="size-4 animate-spin" /> : <BrushCleaning className="size-4" />}
                一键清理
              </Button>
            </div>
          </Card>

          {shownItems.length > 0 && (
            <Card className="p-4">
              <div className="mb-2.5 text-[13px] font-semibold">占用明细（均可清理；正被占用的会自动跳过并如实报告）</div>
              <div className="flex flex-col">
                {shownItems.map((it) => (
                  <div key={it.name} className="flex items-center gap-3 border-t border-border py-2 text-[13px] first:border-t-0">
                    <Trash2 className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs" title={it.name}>
                      {it.name}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{it.files} 个文件</span>
                    <span className="w-20 shrink-0 text-right text-xs font-medium">{formatSize(it.size)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="w-[440px]">
          <DialogHeader>
            <DialogTitle>清理安装包缓存</DialogTitle>
            <DialogDescription>
              将删除以下目录的全部内容（预计释放 {formatSize(info?.totalBytes ?? 0)}）：
            </DialogDescription>
          </DialogHeader>
          <ul className="m-0 flex flex-col gap-1.5 pl-4 text-[12.5px] leading-relaxed text-muted-foreground">
            <li className="break-all font-mono text-xs">{info?.dir}</li>
            <li>将删除：winget 下载的安装包副本（{info?.fileCount} 个文件 · {info?.dirCount} 个目录）。</li>
            <li>不会删除：已安装的软件本体、其配置与数据；正被占用的文件会跳过并如实报告。</li>
            <li>影响：下次安装同一软件需重新下载安装包，仅此而已。</li>
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              再想想
            </Button>
            <Button onClick={() => void run()}>
              <BrushCleaning className="size-3.5" /> 确认清理
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
