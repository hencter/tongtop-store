/** 设置弹层：默认安装目录（如 D:\Apps）+ 启动后行为 + 版本与检查更新。 */

import { useState } from "react";
import { HardDrive, Loader2, RefreshCw, Rocket } from "lucide-react";
import { useSettingsStore } from "../state/settingsStore";
import { useUpdateStore } from "../state/updateStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const installLocation = useSettingsStore((s) => s.installLocation);
  const setInstallLocation = useSettingsStore((s) => s.setInstallLocation);
  const autoExit = useSettingsStore((s) => s.autoExit);
  const setAutoExit = useSettingsStore((s) => s.setAutoExit);
  const check = useUpdateStore((s) => s.check);
  const checking = useUpdateStore((s) => s.checking);
  const info = useUpdateStore((s) => s.info);
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[480px]">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>安装与更新偏好，即改即存。</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 p-4">
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium">
              <HardDrive className="size-3.5" /> 默认安装目录
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="留空 = winget 默认位置"
                value={draft ?? installLocation}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  if (draft !== null) {
                    setInstallLocation(draft.trim());
                    setDraft(null);
                  }
                }}
              />
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  setInstallLocation("D:\\Apps");
                  setDraft(null);
                }}
              >
                装到 D:\Apps
              </Button>
            </div>
            <p className="mb-0 mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              仅对新安装生效（winget --location）；部分软件安装器不支持自定义目录，会按它们自己的默认位置安装。
            </p>
          </div>

          <div className="border-t border-border pt-3.5">
            <div className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium">
              <Rocket className="size-3.5" /> 启动智能体后
            </div>
            <label className="flex cursor-pointer items-center justify-between text-[13px]">
              <span className="text-muted-foreground">退出商店（仅桌面端智能体；CLI 在内嵌终端运行，商店常驻）</span>
              <Switch checked={autoExit} onCheckedChange={setAutoExit} />
            </label>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-3.5">
            <div className="text-[13px]">
              <div className="font-medium">应用商店 v{info?.current ?? "0.4.1"}</div>
              <div className="text-[11px] text-muted-foreground">发布渠道：GitHub Releases</div>
            </div>
            <Button variant="outline" size="sm" disabled={checking} onClick={() => void check(true)}>
              {checking ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              检查更新
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
