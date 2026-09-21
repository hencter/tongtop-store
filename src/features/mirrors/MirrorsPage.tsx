/** 镜像中心（issue #21：测速与修改配置分离）。
 *  顶部总览：上次测速时间 + 「测速」（只测量）与「应用推荐」（才修改）分开；
 *  全局开关「允许自动切换源」默认关闭——开启前明确影响范围；
 *  各卡片：当前源、候选与延迟、推荐、变更预览确认、恢复官方源。 */

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, RotateCcw, Zap } from "lucide-react";
import { type MirrorTool } from "../../catalog/mirrors";
import { useCatalogStore } from "../../state/catalogStore";
import { useT } from "../../i18n";
import * as ipc from "../../ipc/client";
import { useMirrorStore } from "../../state/mirrorStore";
import { useAppStore } from "../../state/appStore";
import { useSettingsStore } from "../../state/settingsStore";
import { timeLabel } from "../../domain/format";
import { AppIcon } from "../../components/AppIcon";
import { PageFilter } from "../../components/PageFilter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function ToolCard({ tool }: { tool: MirrorTool }) {
  const t = useT();
  const status = useMirrorStore((s) => s.status?.find((x) => x.tool === tool.id));
  const applying = useMirrorStore((s) => s.applying === tool.id);
  const message = useMirrorStore((s) => s.message[tool.id]);
  const recommendation = useMirrorStore((s) => s.recommendations[tool.id]);
  const latencies = useMirrorStore((s) => s.latencies);
  const apply = useMirrorStore((s) => s.apply);
  const [selected, setSelected] = useState(tool.presets[0]?.value ?? "");
  /** 变更预览确认：待应用的目标值（null = 无弹窗） */
  const [pending, setPending] = useState<string | null>(null);

  const unavailable = tool.needsTool ? status && !status.installed : false;
  const onMirror = status && tool.presets.some((p) => p.value && status.current.includes(p.value.replace(/^sparse\+/, "").replace(/^https?:\/\//, "").split("/")[0]));
  const lat = (v: string) => {
    const ms = latencies[v];
    return ms == null ? "" : `（${ms}ms）`;
  };
  const pendingLabel = tool.presets.find((p) => p.value === pending)?.label ?? pending ?? "";

  return (
    <Card className="flex flex-col gap-2.5 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 font-semibold">
          <AppIcon id={`mirror:${tool.id}`} name={tool.name} size={26} />
          {tool.name}
        </div>
        {!status ? null : unavailable ? (
          <Badge variant="destructive">{tool.needsTool}{t(" 未安装")}</Badge>
        ) : onMirror ? (
          <Badge variant="ok">
            <CheckCircle2 className="size-3" /> {t("已用镜像")}
          </Badge>
        ) : (
          <Badge variant="secondary">{t("官方源")}</Badge>
        )}
      </div>
      <div className="text-xs text-muted-foreground">{tool.desc}</div>
      <div className="truncate rounded-md bg-muted px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground" title={status?.current}>
        {t("当前：")}{status ? status.current || "—" : t("检测中…")}
      </div>
      {recommendation && (
        <div className="rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-[11px]">
          {t("测速推荐 → ")}{recommendation.label}（{recommendation.ms}ms
          {recommendation.curMs != null ? `，${t("当前 ")}${recommendation.curMs}ms` : `，${t("当前源不可达")}`}）
        </div>
      )}
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
          onClick={() => setPending(selected)}
          title={t("应用前会预览变更内容")}
        >
          {applying ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
          {t("应用")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={unavailable || applying}
          onClick={() => void apply(tool.id, tool.official)}
          title={t("恢复官方默认")}
        >
          <RotateCcw className="size-3.5" />
        </Button>
      </div>
      {message?.text && (
        <div className={`text-[11px] ${message.ok ? "text-muted-foreground" : "text-destructive"}`}>
          {message.text}
        </div>
      )}

      {/* 变更预览：应用前明示目标源、作用域、影响与恢复方式 */}
      <Dialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent className="w-[440px]">
          <DialogHeader>
            <DialogTitle>{t("确认切换 ")}{tool.name}{t(" 的源")}</DialogTitle>
            <DialogDescription>
              {pendingLabel}
            </DialogDescription>
          </DialogHeader>
          <ul className="m-0 flex flex-col gap-1.5 pl-4 text-[12.5px] leading-relaxed text-muted-foreground">
            <li>{t("当前源：")}{status?.current || "—"}</li>
            <li className="break-all">{t("目标源：")}{pending}</li>
            <li>{t("配置作用域：当前用户（对该工具的所有使用生效，不限于本商店）")}</li>
            {tool.applyNote && <li>{tool.applyNote}</li>}
            <li>{t("恢复方式：随时点卡片上的 ↺ 按钮切回官方源；切换失败会如实报错，不会假报成功。")}</li>
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>{t("再想想")}</Button>
            <Button
              onClick={() => {
                const v = pending;
                setPending(null);
                if (v) void apply(tool.id, v);
              }}
            >
              <Zap className="size-3.5" /> {t("确认切换")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function GhProxyCard() {
  const t = useT();
  const GH_PROXY_PRESETS = useCatalogStore((s) => s.ghProxyPresets);
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
        {ghProxy ? <Badge variant="ok">{t("加速中")}</Badge> : <Badge variant="secondary">{t("直连")}</Badge>}
      </div>
      <div className="text-xs text-muted-foreground">
        {t("只影响本商店打开的 GitHub 资产链接：详情页直链 + 自更新下载的加速兜底（更新包有 minisign 签名校验，代理不可信也安全），不改系统配置")}
      </div>
      <div className="truncate rounded-md bg-muted px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
        {t("当前：")}{ghProxy || t("直连")}
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {gh?.authed ? (
          <>
            <CheckCircle2 className="size-3 text-ok" />
            {t("gh CLI 已认证 —— Release 拉取走 gh api（5000 次/小时）")}
          </>
        ) : (
          <>
            {t("Release 拉取走匿名 API（60 次/小时）—— 安装 GitHub CLI 并 gh auth login 可提速")}
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
  const t = useT();
  const refresh = useMirrorStore((s) => s.refresh);
  const loading = useMirrorStore((s) => s.loading);
  const tuning = useMirrorStore((s) => s.tuning);
  const tunedAt = useMirrorStore((s) => s.tunedAt);
  const measure = useMirrorStore((s) => s.measure);
  const recommendations = useMirrorStore((s) => s.recommendations);
  const applyRecommended = useMirrorStore((s) => s.applyRecommended);
  const applying = useMirrorStore((s) => s.applying);
  const autoSwitch = useSettingsStore((s) => s.autoSwitchMirrors);
  const setAutoSwitch = useSettingsStore((s) => s.setAutoSwitchMirrors);
  const pageQuery = useAppStore((s) => s.pageQueries.mirrors ?? "");
  const MIRROR_TOOLS = useCatalogStore((s) => s.mirrorTools);
  const [dismissedRecs, setDismissedRecs] = useState(false);

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
    // 进入镜像中心且从未测过速 → 补一轮只读测速（不会修改任何配置）
    if (useMirrorStore.getState().tunedAt === 0) void measure();
  }, [refresh, measure]);

  const recCount = Object.keys(recommendations).length;

  return (
    <div className="page h-full overflow-y-auto">
      <header className="mb-1.5 flex items-center justify-between">
        <h2 className="m-0 text-lg font-semibold tracking-wide">镜像中心</h2>
        <div className="flex items-center gap-2">
          <PageFilter tab="mirrors" placeholder="筛选本页镜像…" />
          {tuning && (
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> {t("测速中…（只测量，不修改配置）")}
            </span>
          )}
          {!tuning && tunedAt > 0 && (
            <span className="text-[11px] text-muted-foreground">
              {t("上次测速 ")}{timeLabel(Math.floor(tunedAt / 1000))}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => { setDismissedRecs(false); void measure(); }} disabled={tuning}>
            <RefreshCw className={`size-3.5 ${tuning ? "animate-spin" : ""}`} /> {t("测速")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> {t("重新检测")}
          </Button>
        </div>
      </header>
      <p className="mb-3 text-xs text-muted-foreground">
        {t("「测速」只测量延迟并给出推荐，不会修改任何配置；切换源影响对应工具在本机的全部使用（不限于本商店）。")}
      </p>

      {/* 全局开关：默认不自动修改其他工具的源（issue #21） */}
      <Card className="mb-3 flex items-center justify-between gap-3 px-3.5 py-2.5">
        <div className="text-xs">
          <div className="font-medium">{t("允许自动切换源")}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {autoSwitch
              ? t("已开启：每次启动测速后会自动把各工具切到最快镜像（影响商店外的开发环境）。")
              : t("已关闭：启动时只测速给推荐，不会自动修改任何工具的配置。")}
          </div>
        </div>
        <Switch checked={autoSwitch} onCheckedChange={setAutoSwitch} />
      </Card>

      {/* 测速推荐：明示将修改哪些工具，确认后才应用 */}
      {!dismissedRecs && recCount > 0 && (
        <Card className="mb-3 flex items-center justify-between gap-3 border-primary/30 bg-primary/5 px-3.5 py-2.5">
          <div className="text-xs">
            <span className="font-medium">{t("测速建议：")}{recCount}{t(" 个工具可获得更快镜像")}</span>
            <span className="ml-2 text-muted-foreground">
              {Object.values(recommendations).map((r) => `${r.label}（${r.ms}ms）`).join("、")}
            </span>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDismissedRecs(true)}>{t("忽略")}</Button>
            <Button size="sm" disabled={applying !== null} onClick={() => void applyRecommended()}>
              {applying ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
              {t("应用推荐")}
            </Button>
          </div>
        </Card>
      )}

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
