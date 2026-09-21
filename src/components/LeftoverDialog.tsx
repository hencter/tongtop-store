/** 残留清理弹层：卸载后列出注册表残留与 AppData 数据目录，勾选后清除。 */

import { Database, FolderOpen, Loader2, ShieldAlert, Trash2 } from "lucide-react";
import { useLeftoverStore } from "../state/leftoverStore";
import { formatSize } from "../domain/github";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function LeftoverDialog() {
  const forId = useLeftoverStore((s) => s.forId);
  const forName = useLeftoverStore((s) => s.forName);
  const report = useLeftoverStore((s) => s.report);
  const scanning = useLeftoverStore((s) => s.scanning);
  const cleaning = useLeftoverStore((s) => s.cleaning);
  const result = useLeftoverStore((s) => s.result);
  const checkedDirs = useLeftoverStore((s) => s.checkedDirs);
  const checkedKeys = useLeftoverStore((s) => s.checkedKeys);
  const toggleDir = useLeftoverStore((s) => s.toggleDir);
  const toggleKey = useLeftoverStore((s) => s.toggleKey);
  const clean = useLeftoverStore((s) => s.clean);
  const close = useLeftoverStore((s) => s.close);

  const dirCount = Object.values(checkedDirs).filter(Boolean).length;
  const keyCount = Object.values(checkedKeys).filter(Boolean).length;
  const nothing = report && report.registry.length === 0 && report.dirs.length === 0;

  return (
    <Dialog open={forId !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent className="w-[600px]">
        <DialogHeader>
          <DialogTitle>卸载完成 · 残留检查</DialogTitle>
          <DialogDescription>
            {forName}（{forId}）—— Geek 式扫描注册表与 AppData 目录
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[52vh] overflow-y-auto p-4 pt-1">
          {scanning && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> 正在扫描残留…
            </div>
          )}

          {nothing && !result && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              没有发现残留项，卸载得很干净。
            </div>
          )}

          {report && !nothing && !result && (
            <>
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-gold/30 bg-gold/5 p-2.5 text-[11px] leading-relaxed text-gold">
                <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                所有残留默认不勾选，请逐项确认后再清除。删除操作不可恢复；也可以直接「保留残留并结束」。
              </div>

              {report.dirs.length > 0 && (
                <div className="mb-3">
                  <div className="mb-1.5 flex items-baseline gap-2 text-[13px] font-semibold">
                    数据目录（{report.dirs.length}）
                    <span className="text-[11px] font-normal text-destructive">含该软件的配置与本地数据，删除后不可恢复</span>
                  </div>
                  <div className="flex flex-col">
                    {report.dirs.map((d) => (
                      <label key={d.path} className="flex cursor-pointer items-center gap-2.5 border-t border-border py-2 text-[13px] first:border-t-0">
                        <input type="checkbox" checked={!!checkedDirs[d.path]} onChange={() => toggleDir(d.path)} />
                        <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate font-mono text-xs" title={d.path}>{d.path}</span>
                        <span className="shrink-0 text-xs font-medium">{formatSize(d.size)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {report.registry.length > 0 && (
                <div>
                  <div className="mb-1.5 flex items-baseline gap-2 text-[13px] font-semibold">
                    注册表（{report.registry.length}）
                    <span className="text-[11px] font-normal text-muted-foreground">「卸载项」是残留卸载信息，删除一般安全；「配置」项可能含个人设置；HKLM 项需管理员权限，失败会如实跳过</span>
                  </div>
                  <div className="flex flex-col">
                    {report.registry.map((k) => (
                      <label key={k.key} className="flex cursor-pointer items-center gap-2.5 border-t border-border py-2 text-[13px] first:border-t-0">
                        <input type="checkbox" checked={!!checkedKeys[k.key]} onChange={() => toggleKey(k.key)} />
                        <Database className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate font-mono text-xs" title={k.key}>{k.key}</span>
                        <Badge variant={k.kind === "uninstall" ? "default" : "secondary"}>
                          {k.kind === "uninstall" ? "卸载项" : "配置"}
                        </Badge>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {result && (
            <div className="py-4 text-center text-sm">
              <div className="font-semibold text-ok">清理完成</div>
              <div className="mt-1 text-xs text-muted-foreground">
                释放 {formatSize(result.freedBytes)} · 目录 {result.dirsDeleted} 删 / {result.dirsSkipped} 跳过
                · 注册表 {result.keysDeleted} 删 / {result.keysSkipped} 跳过
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border p-4">
          {!result && report && !nothing && (
            <Button variant="destructive" disabled={cleaning || (dirCount === 0 && keyCount === 0)} onClick={() => void clean()}>
              {cleaning ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              清除选中（{dirCount + keyCount}）
            </Button>
          )}
          <Button variant={result || nothing ? "default" : "outline"} onClick={close}>
            {result || nothing ? "完成" : "保留残留并结束"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
