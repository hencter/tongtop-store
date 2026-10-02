/** 首页软件卡：名称 / 用途 / 来源 + 安装状态。
 *  主操作按状态决定：未安装 → 安装（或更新），已安装 → 查看详情（卸载只在详情/已安装页）。
 *  首页与精选页共用，避免两处各写一套按钮状态机。 */

import { memo } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, Clock, Download, ExternalLink, Loader2, TrendingUp } from "lucide-react";
import type { CatalogApp } from "../catalog/apps";
import { useTaskStore } from "../state/taskStore";
import { useDetailStore } from "../state/detailStore";
import { useT } from "../i18n";
import { AppIcon } from "./AppIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export type CardState = "none" | "installed" | "upgrade";

export const AppCard = memo(function AppCard({
  app,
  state,
  className,
}: {
  app: CatalogApp;
  state: CardState;
  className?: string;
}) {
  const t = useT();
  const runTask = useTaskStore((s) => s.runTask);
  const silent = useTaskStore((s) => s.silent);
  const openDetail = useDetailStore((s) => s.open);
  const action = state === "upgrade" ? "upgrade" : "install";
  const taskId = `winget:${action}:${app.id}`;
  const taskState = useTaskStore((s) => s.taskState(taskId));
  return (
    <Card className={`flex flex-col gap-1.5 p-4 transition-colors hover:border-foreground/20 ${className ?? ""}`}>
      <div className="flex items-start justify-between">
        <AppIcon id={app.id} name={app.name} size={42} />
        <div className="flex gap-1">
          {state === "installed" && (
            <Badge variant="outline">
              <Check className="size-3.5 text-ok" /> {t("已安装")}
            </Badge>
          )}
          {state === "upgrade" && (
            <Badge variant="outline" className="border-primary/40 text-primary">
              <TrendingUp className="size-3.5" /> {t("可更新")}
            </Badge>
          )}
          {app.github && <Badge variant="secondary">GitHub</Badge>}
        </div>
      </div>
      <div className="mt-1 font-semibold">{app.name}</div>
      <div className="line-clamp-2 h-8 text-xs text-muted-foreground" title={app.desc}>
        {app.desc}
      </div>
      <div className="text-[11px] text-muted-foreground">{new URL(app.site).host}</div>
      <div className="mt-1.5 flex gap-2">
        {state === "installed" ? (
          <Button size="sm" variant="outline" onClick={() => openDetail(app.id)} title={t("查看详情")}>
            {t("查看详情")}
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={taskState !== null}
            onClick={() =>
              void runTask(taskId, {
                kind: "winget",
                action,
                wingetId: app.id,
                silent,
                display: `${action === "upgrade" ? "更新" : "安装"} ${app.name}`,
              })
            }
          >
            {taskState === "running" ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> {t("进行中")}
              </>
            ) : taskState === "queued" ? (
              <>
                <Clock className="size-3.5" /> {t("排队中")}
              </>
            ) : state === "upgrade" ? (
              <>
                <TrendingUp className="size-3.5" /> {t("更新")}
              </>
            ) : (
              <>
                <Download className="size-3.5" /> {t("安装")}
              </>
            )}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => void openUrl(app.site)} title={app.site}>
          <ExternalLink className="size-3.5" /> {t("官网")}
        </Button>
      </div>
    </Card>
  );
});
