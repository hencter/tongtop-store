/** 自更新弹窗：新版本信息 + 更新日志 + 下载进度；立即更新 / 忽略此版本。 */

import { openUrl } from "@tauri-apps/plugin-opener";
import { Download, Loader2 } from "lucide-react";
import { useUpdateStore } from "../state/updateStore";
import { formatSize } from "../domain/github";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function SelfUpdateDialog() {
  const info = useUpdateStore((s) => s.info);
  const open = useUpdateStore((s) => s.open);
  const progress = useUpdateStore((s) => s.progress);
  const error = useUpdateStore((s) => s.error);
  const dismiss = useUpdateStore((s) => s.dismiss);
  const start = useUpdateStore((s) => s.start);

  const downloading = progress !== null;
  const upToDate = info !== null && !info.hasUpdate;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !downloading && dismiss(false)}>
      <DialogContent className="w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {upToDate ? "已是最新版本" : `发现新版本 v${info?.latest}`}
          </DialogTitle>
          <DialogDescription>
            {upToDate
              ? `当前版本 v${info?.current}，无需更新。`
              : `当前 v${info?.current} → 最新 v${info?.latest}${info?.assetSize ? `（${formatSize(info.assetSize)}）` : ""}`}
          </DialogDescription>
        </DialogHeader>

        {info?.notes && !upToDate && (
          <div className="max-h-40 overflow-y-auto px-4">
            <pre className="whitespace-pre-wrap break-all font-sans text-xs leading-relaxed text-muted-foreground">
              {info.notes}
            </pre>
          </div>
        )}

        {downloading && (
          <div className="px-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-1.5 text-right text-[11px] text-muted-foreground">{progress}%</div>
          </div>
        )}

        {error && (
          <div className="mx-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <DialogFooter>
          {!upToDate && info?.releaseUrl && (
            <Button variant="link" className="mr-auto" onClick={() => void openUrl(info.releaseUrl)}>
              查看发布页
            </Button>
          )}
          {upToDate ? (
            <Button onClick={() => dismiss(false)}>好的</Button>
          ) : (
            <>
              <Button variant="ghost" disabled={downloading} onClick={() => dismiss(true)}>
                忽略此版本
              </Button>
              <Button disabled={downloading || !info?.assetUrl} onClick={() => void start()} title="下载后静默安装并自动重启，全程无弹窗">
                {downloading ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" /> 下载中…
                  </>
                ) : (
                  <>
                    <Download className="size-3.5" /> 立即更新
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
