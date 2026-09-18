/** Windows Terminal 建议弹层：CLI 智能体启动前未检测到 wt 时出现。
 *  一键安装并启动（winget 官方源）/ 仍用旧版控制台 / 取消。
 */

import { Loader2, Rocket, Terminal } from "lucide-react";
import { useTerminalStore } from "../state/terminalStore";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function TerminalPromptDialog() {
  const promptFor = useTerminalStore((s) => s.promptFor);
  const installing = useTerminalStore((s) => s.installing);
  const installError = useTerminalStore((s) => s.installError);
  const choose = useTerminalStore((s) => s.choose);
  const installAndContinue = useTerminalStore((s) => s.installAndContinue);

  return (
    <Dialog open={promptFor !== null} onOpenChange={(o) => !o && choose("cancel")}>
      <DialogContent className="w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="size-4.5 text-primary" /> 建议使用 Windows Terminal
          </DialogTitle>
          <DialogDescription>
            {promptFor} 将在终端中运行，但检测到你的系统还没有 Windows Terminal
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 pt-1">
          <p className="m-0 rounded-lg bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
            Windows Terminal 是微软官方现代终端：多标签、GPU 加速渲染、中文与 emoji 显示更稳定。
            一键安装（winget 官方源，约 20MB）后自动继续启动；也可以直接用旧版控制台。
          </p>
          {installError && <p className="mb-0 mt-2.5 text-xs text-destructive">{installError}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-border p-4">
          <Button variant="ghost" disabled={installing} onClick={() => choose("cancel")}>
            取消
          </Button>
          <Button variant="outline" disabled={installing} onClick={() => choose("legacy")} title="用系统自带的旧版控制台窗口启动">
            旧版控制台启动
          </Button>
          <Button disabled={installing} onClick={() => void installAndContinue()}>
            {installing ? <Loader2 className="size-3.5 animate-spin" /> : <Rocket className="size-3.5" />}
            {installing ? "安装中…" : "一键安装并启动"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
