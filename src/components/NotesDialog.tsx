/** 更新日志弹层：GitHub Release 正文或 winget 索引 ReleaseNotes，附官方发布页链接。 */

import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, Loader2 } from "lucide-react";
import { useNotesStore } from "../state/notesStore";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function NotesDialog() {
  const notesFor = useNotesStore((s) => s.notesFor);
  const title = useNotesStore((s) => s.title);
  const text = useNotesStore((s) => s.text);
  const url = useNotesStore((s) => s.url);
  const loading = useNotesStore((s) => s.loading);
  const error = useNotesStore((s) => s.error);
  const close = useNotesStore((s) => s.close);

  return (
    <Dialog open={notesFor !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent className="w-[620px]">
        <DialogHeader>
          <DialogTitle>更新日志 · {title}</DialogTitle>
          <DialogDescription>{notesFor}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[52vh] overflow-y-auto p-4 pt-1">
          {loading && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> 正在获取更新日志…
            </div>
          )}
          {error && <div className="py-4 text-sm text-destructive">{error}</div>}
          {!loading && !error && (
            <pre className="select-text whitespace-pre-wrap break-all font-sans text-[13px] leading-relaxed text-foreground/90">
              {text || "没有日志正文，点下方按钮查看官方发布页。"}
            </pre>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-4">
          {url && (
            <Button variant="outline" onClick={() => void openUrl(url)}>
              <ExternalLink className="size-3.5" /> 官方发布页
            </Button>
          )}
          <Button onClick={close}>关闭</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
