/** 镜像中心：检测各工具链当前源，一键切换国内镜像 / 恢复官方。 */

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, RotateCcw, Zap } from "lucide-react";
import { GH_PROXY_PRESETS, MIRROR_TOOLS, type MirrorTool } from "../../catalog/mirrors";
import * as ipc from "../../ipc/client";
import { useMirrorStore } from "../../state/mirrorStore";
import { useAppStore } from "../../state/appStore";
import { useSettingsStore } from "../../state/settingsStore";
import { timeLabel } from "../../domain/format";
import { AppIcon } from "../../components/AppIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, Skeleton } from "@/components/ui/skeleton";

function ToolCard({ tool }: { tool: MirrorTool }) {
  const status = useMirrorStore((s) => s.status?.find((x) => x.tool === tool.id));
  const applying = useMirrorStore((s) => s.applying === tool.id);
  const message = useMirrorStore((s) => s.message[tool.id]);
  const latencies = useMirrorStore((s) => s.latencies);
  const apply = useMirrorStore((s) => s.apply);
  const [selected, setSelected] = useState(tool.presets[0]?.value ?? "");

  const unavailable = tool.needsTool ? status && !status.installed : false;
  const onMirror = status && tool.presets.some((p) => p.value && status.current.includes(p.value.replace(/^sparse\+/, "").replace(/^https?:\/\//, "").split("/")[0]));
  const lat = (v: string) => {
    const ms = latencies[v];
    return ms == null ? "" : `（${ms}ms）`;
  };

  return (
    <Card className="flex flex-col gap-2.5 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 font-semibold">
          <AppIcon id={`mirror:${tool.id}`} name={tool.name} size={26} />
          {tool.name}
        </div>
        {!status ? null : unavailable ? (
          <Badge variant="destructive">{tool.needsTool} 未安装</Badge>
        ) : onMirror ? (
          <Badge variant="ok">
            <CheckCircle2 className="size-3" /> 已用镜像
          </Badge>
        ) : (
          <Badge variant="secondary">官方源</Badge>
        )}
      </div>
      <div className="text-xs text-muted-foreground">{tool.desc}</div>
      <div className="truncate rounded-md bg-muted px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground" title={status?.current}>
        当前：{status ? status.current || "—" : "检测中…"}
      </div>
      <div className="mt-auto flex gap-2">
        <Select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={unavailable || applying}
          className="flex-1"
        >
          {tool.presets.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
              {p.note ? `（${p.note}）` : ""}
              {lat(p.value)}
            </option>
          ))}
        </Select>
        <Button
          size="sm"
          disabled={unavailable || applying || !selected}
          onClick={() => void apply(tool.id, selected)}
          title={tool.applyNote}
        >
          {applying ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
          应用
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={unavailable || applying}
          onClick={() => void apply(tool.id, tool.official)}
          title="恢复官方默认"
        >
          <RotateCcw className="size-3.5" />
        </Button>
      </div>
      {message && <div className="text-[11px] text-muted-foreground">{message}</div>}
    </Card>
  );
}

function GhProxyCard() {
  const ghProxy = useSettingsStore((s) => s.ghProxy);
  const setGhProxy = useSettingsStore((s) => s.setGhProxy);
  const [gh, setGh] = useState<{ installed: boolean; authed: boolean } | null>(null);

  useEffect(() => {
    void ipc.ghCliStatus().then(setGh);
  }, []);

  return (
    <Card className="flex flex-col gap-2.5 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 font-semibold">
          <AppIcon id="mirror:github" name="GitHub" size={26} />
          GitHub 下载加速
        </div>
        {ghProxy ? <Badge variant="ok">加速中</Badge> : <Badge variant="secondary">直连</Badge>}
      </div>
      <div className="text-xs text-muted-foreground">
        只影响本商店打开的 GitHub 资产链接（详情页的安装包直链），不改系统配置
      </div>
      <div className="truncate rounded-md bg-muted px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
        当前：{ghProxy || "直连"}
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {gh?.authed ? (
          <>
            <CheckCircle2 className="size-3 text-ok" />
            gh CLI 已认证 —— Release 拉取走 gh api（5000 次/小时）
          </>
        ) : (
          <>
            Release 拉取走匿名 API（60 次/小时）—— 安装 GitHub CLI 并 gh auth login 可提速
          </>
        )}
      </div>
      <div className="mt-auto">
        <Select value={ghProxy} onChange={(e) => setGhProxy(e.target.value)}>
          {GH_PROXY_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
              {p.note ? `（${p.note}）` : ""}
            </option>
          ))}
        </Select>
      </div>
    </Card>
  );
}

export function MirrorsPage() {
  const refresh = useMirrorStore((s) => s.refresh);
  const loading = useMirrorStore((s) => s.loading);
  const tuning = useMirrorStore((s) => s.tuning);
  const tunedAt = useMirrorStore((s) => s.tunedAt);
  const autoTune = useMirrorStore((s) => s.autoTune);
  const pageQuery = useAppStore((s) => s.pageQueries.mirrors ?? "");

  // 标题栏搜索（本页作用域）：过滤工具名 / 描述
  const q = pageQuery.trim().toLowerCase();
  const shownTools = q
    ? MIRROR_TOOLS.filter(
        (t) => t.name.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q) || t.id.includes(q),
      )
    : MIRROR_TOOLS;
  const showGhCard = !q || "github 下载加速".includes(q);

  useEffect(() => {
    void refresh();
    // 进入镜像中心且从未测过速 → 自动补一轮（启动时的自动测速通常已在后台跑过）
    if (useMirrorStore.getState().tunedAt === 0) void autoTune();
  }, [refresh, autoTune]);

  return (
    <div className="page h-full overflow-y-auto">
      <header className="mb-1.5 flex items-center justify-between">
        <h2 className="m-0 text-lg font-semibold tracking-wide">镜像中心</h2>
        <div className="flex items-center gap-2">
          {tuning && (
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> 自动测速中…
            </span>
          )}
          {!tuning && tunedAt > 0 && (
            <span className="text-[11px] text-muted-foreground">
              已自动选择最快镜像 · {timeLabel(Math.floor(tunedAt / 1000))}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => void autoTune()} disabled={tuning}>
            <RefreshCw className={`size-3.5 ${tuning ? "animate-spin" : ""}`} /> 重新测速
          </Button>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> 重新检测
          </Button>
        </div>
      </header>
      <p className="mb-4 text-xs text-muted-foreground">
        无需任何配置：每次启动都会在后台自动测速，把每个工具切换到延迟最低的镜像。也可手动指定。
      </p>

      {loading && !useMirrorStore.getState().status && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[170px]" />
          ))}
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
        {shownTools.map((t) => (
          <ToolCard key={t.id} tool={t} />
        ))}
        {showGhCard && <GhProxyCard />}
      </div>
    </div>
  );
}
