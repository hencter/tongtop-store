/** 缓存清理页：检查 winget 安装下载的安装包（%TEMP%\WinGet），判断可移除性并一键清理。 */

import { useCallback, useEffect, useState } from "react";
import { BrushCleaning, CheckCircle2, FolderOpen, Loader2, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import * as ipc from "../../ipc/client";
import type { CleanupInfo, CleanupResult } from "../../ipc/types";
import { formatSize } from "../../domain/github";
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
  const [info, setInfo] = useState<CleanupInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<CleanupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setInfo(await ipc.cleanupScan());
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
        <h2 className="m-0 text-lg font-semibold tracking-wide">缓存清理</h2>
        <Button variant="outline" size="sm" onClick={() => void scan()} disabled={loading}>
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> 重新检查
        </Button>
      </header>
      <p className="mb-4 text-xs text-muted-foreground">
        winget 安装软件时会把安装包下载到临时目录，装完不会立即删除。这里检查它们并安全移除。
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-[13px] text-destructive">
          {error}
        </div>
      )}

      {result && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-ok/40 bg-ok/10 px-3.5 py-2.5 text-[13px] text-ok">
          <CheckCircle2 className="size-4" />
          已释放 {formatSize(result.freedBytes)}（删除 {result.deleted} 项
          {result.skipped > 0 ? `，${result.skipped} 项被占用已跳过` : ""}）
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

          {info.items.length > 0 && (
            <Card className="p-4">
              <div className="mb-2.5 text-[13px] font-semibold">占用最多的项目</div>
              <div className="flex flex-col">
                {info.items.map((it) => (
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
              将删除 {info?.dir} 下的全部内容（约 {formatSize(info?.totalBytes ?? 0)}）。
              这些只是安装时下载的安装包副本，删除不影响已安装的软件。
            </DialogDescription>
          </DialogHeader>
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
