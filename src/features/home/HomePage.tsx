/** 首页（issue #17）：发现与电脑状态工作台。
 *  布局：精简欢迎区 → 我的电脑概览 → 继续上次操作（有上下文才出现）→
 *  编辑精选软件（8 个）→ AI 工具精选（4 个）→ 按用途浏览 → 页脚来源说明。
 *  不再放与标题栏重复的搜索框；全量目录不铺开，分类入口跳进搜索页（带筛选）。
 *  已安装卡片主操作是「查看详情」，卸载只在详情/已安装页。 */

import { memo, useEffect, useMemo } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, ChevronRight, Clock, Download, ExternalLink, Globe, KeyRound, Loader2, Monitor, Play, Rocket, ShieldAlert, SquareTerminal, TrendingUp, XCircle } from "lucide-react";
import { AppLogo } from "../../components/AppLogo";
import { type CatalogApp } from "../../catalog/apps";
import { CONCERN_CAUTION, type AgentRecipe } from "../../catalog/agents";
import { useCatalogStore } from "../../state/catalogStore";
import { useAppStore } from "../../state/appStore";
import { useAgentStore } from "../../state/agentStore";
import { useDetailStore } from "../../state/detailStore";
import { useTaskStore } from "../../state/taskStore";
import { timeLabel } from "../../domain/format";
import { useT } from "../../i18n";
import { AppIcon } from "../../components/AppIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const FEATURED_APPS = 8;
const FEATURED_AGENTS = 4;

type CardState = "none" | "installed" | "upgrade";

/** 首页软件卡：名称/用途/来源 + 安装状态；主操作按状态 = 安装 / 更新 / 查看详情（不再有卸载） */
const AppCard = memo(function AppCard({ app, state }: { app: CatalogApp; state: CardState }) {
  const t = useT();
  const runTask = useTaskStore((s) => s.runTask);
  const silent = useTaskStore((s) => s.silent);
  const openDetail = useDetailStore((s) => s.open);
  const action = state === "upgrade" ? "upgrade" : "install";
  const taskId = `winget:${action}:${app.id}`;
  const taskState = useTaskStore((s) => s.taskState(taskId));
  return (
    <Card className="flex flex-col gap-1.5 p-4 transition-colors hover:border-foreground/20">
      <div className="flex items-start justify-between">
        <AppIcon id={app.id} name={app.name} size={42} />
        <div className="flex gap-1">
          {state === "installed" && (
            <Badge variant="outline">
              <Check className="size-3.5 text-ok" /> {t("已安装")}
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

/** 智能体形态徽标：桌面 / CLI / Web + 密钥需求（issue #17：标示形态与账号/密钥） */
function agentKindBadges(recipe: AgentRecipe, t: (s: string) => string) {
  const kinds: { icon: typeof Monitor; label: string }[] = [];
  if (recipe.desktopNames) kinds.push({ icon: Monitor, label: t("桌面") });
  if (recipe.webPort) kinds.push({ icon: Globe, label: "Web" });
  if (kinds.length === 0) kinds.push({ icon: SquareTerminal, label: "CLI" });
  return kinds;
}

const AgentCard = memo(function AgentCard({
  recipe,
  installed,
  onOpen,
}: {
  recipe: AgentRecipe;
  installed: boolean;
  onOpen: () => void;
}) {
  const t = useT();
  const needsKey = recipe.env.some((e) => e.secret && e.required !== false);
  return (
    <Card className="flex flex-col gap-1.5 p-4 transition-colors hover:border-foreground/20">
      <div className="flex items-start justify-between gap-2">
        <AppIcon id={`agent:${recipe.id}`} name={recipe.name} size={42} />
        <div className="flex flex-wrap justify-end gap-1">
          {installed && (
            <Badge variant="outline">
              <Check className="size-3.5 text-ok" /> {t("已安装")}
            </Badge>
          )}
          {agentKindBadges(recipe, t).map((k) => (
            <Badge key={k.label} variant="secondary">
              <k.icon className="size-3" /> {k.label}
            </Badge>
          ))}
          {needsKey && (
            <Badge variant="secondary" title={t("使用前需要配置厂商密钥")}>
              <KeyRound className="size-3" /> {t("需密钥")}
            </Badge>
          )}
          {recipe.concerns && (
            <Badge
              variant="outline"
              className="border-gold/40 px-1.5 text-gold"
              title={recipe.concerns.map((c) => CONCERN_CAUTION[c]).join("\n")}
            >
              <ShieldAlert className="size-3" />
            </Badge>
          )}
        </div>
      </div>
      <div className="mt-1 font-semibold">{recipe.name}</div>
      <div className="line-clamp-2 h-8 text-xs text-muted-foreground" title={recipe.desc}>
        {recipe.desc}
      </div>
      <div className="text-[11px] text-muted-foreground">{recipe.vendor}</div>
      <div className="mt-auto flex gap-2 pt-1.5">
        <Button size="sm" className="flex-1" onClick={onOpen}>
          {installed ? (
            <>
              <Play className="size-3.5" /> {t("打开")}
            </>
          ) : (
            <>
              <Rocket className="size-3.5" /> {t("一键装机")}
            </>
          )}
        </Button>
        <Button variant="outline" size="sm" onClick={() => void openUrl(recipe.homepage)} title={recipe.homepage}>
          <ExternalLink className="size-3.5" />
        </Button>
      </div>
    </Card>
  );
});

export function HomePage() {
  const t = useT();
  const setTab = useAppStore((s) => s.setTab);
  const setBrowseCategory = useAppStore((s) => s.setBrowseCategory);
  const installed = useAppStore((s) => s.installed);
  const upgrades = useAppStore((s) => s.upgrades);
  const openAgent = useAgentStore((s) => s.open);
  const agentsInstalled = useAgentStore((s) => s.installedMap);
  const running = useTaskStore((s) => s.running);
  const queueLen = useTaskStore((s) => s.queue.length);
  const lastDone = useTaskStore((s) => s.done);
  const openPanel = useTaskStore((s) => s.openPanel);
  // 目录数据：内置首屏 + 网站 API 实时更新（catalogStore 统一持有）
  const CATALOG = useCatalogStore((s) => s.apps);
  const AGENTS = useCatalogStore((s) => s.agents);
  const CATEGORIES = useCatalogStore((s) => s.categories);
  const catalogAt = useCatalogStore((s) => s.updatedAt);
  const catalogSource = useCatalogStore((s) => s.source);
  const tab = useAppStore((s) => s.tab);

  // 首页推荐是核心内容：每次回到首页都触发一次目录刷新（store 内 5 分钟冷却）
  useEffect(() => {
    if (tab === "home") void useCatalogStore.getState().refresh();
  }, [tab]);

  // 打开智能体装机页（自动检测到已安装则直接落到「启动」）
  const pickAgent = (id: string) => {
    openAgent(id);
    setTab("agents");
  };

  // 快照索引：已安装 / 可更新（毫秒级本地数据，不改变首屏零 IPC）
  const installedSet = useMemo(
    () => new Set((installed ?? []).map((a) => a.id.toLowerCase())),
    [installed],
  );
  const upgradeSet = useMemo(
    () => new Set((upgrades ?? []).map((u) => u.id.toLowerCase())),
    [upgrades],
  );
  const cardState = (id: string): CardState =>
    upgradeSet.has(id.toLowerCase()) ? "upgrade" : installedSet.has(id.toLowerCase()) ? "installed" : "none";

  // 编辑精选：固定取目录前 N 个并明确标注「编辑精选」（不冒充个性化推荐）
  const featuredApps = CATALOG.slice(0, FEATURED_APPS);
  const featuredAgents = AGENTS.filter((a) => a.desktopNames).slice(0, FEATURED_AGENTS);

  const browse = (catId: string) => {
    setBrowseCategory(catId);
    setTab("search");
  };

  return (
    <div className="page h-full overflow-y-auto">
      {/* 精简欢迎区：一句价值主张 + 发现入口（搜索统一走标题栏全局搜索） */}
      <section className="flex items-center gap-4 pb-2 pt-4">
        <AppLogo className="size-12 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-lg font-semibold tracking-tight">{t("应用商店")}</h1>
          <p className="m-0 mt-0.5 truncate text-xs text-muted-foreground">
            {t("不托管任何安装包，只做官方软件下载链接的分发")}
          </p>
        </div>
        <Button onClick={() => setTab("search")}>
          <Download className="size-3.5" /> {t("发现软件")}
        </Button>
      </section>

      {/* 我的电脑概览：已安装 / 待更新 / 进行中任务（未知时如实显示统计中） */}
      <section className="mt-3 grid grid-cols-3 gap-3">
        <button onClick={() => setTab("installed")} className="text-left">
          <Card className="p-3.5 transition-colors hover:border-foreground/20">
            <div className="text-[11px] text-muted-foreground">{t("已安装软件")}</div>
            <div className="mt-1 text-xl font-semibold">
              {installed === null ? t("统计中…") : installed.length}
            </div>
          </Card>
        </button>
        <button onClick={() => setTab("updates")} className="text-left">
          <Card className="p-3.5 transition-colors hover:border-foreground/20">
            <div className="text-[11px] text-muted-foreground">{t("待更新")}</div>
            <div className="mt-1 text-xl font-semibold">
              {upgrades === null ? t("统计中…") : upgrades.length}
              {upgrades !== null && upgrades.length > 0 && (
                <span className="ml-1.5 align-middle text-[11px] font-normal text-primary">{t("去看看")}</span>
              )}
            </div>
          </Card>
        </button>
        <button onClick={openPanel} className="text-left">
          <Card className="p-3.5 transition-colors hover:border-foreground/20">
            <div className="text-[11px] text-muted-foreground">{t("进行中任务")}</div>
            <div className="mt-1 truncate text-xl font-semibold">
              {running ? (
                <span className="flex items-center gap-1.5 text-sm">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  <span className="truncate">{running.label}{queueLen > 0 ? ` +${queueLen}` : ""}</span>
                </span>
              ) : queueLen > 0 ? (
                <span className="text-sm">{queueLen}{t(" 个排队中")}</span>
              ) : (
                <span className="text-sm font-normal text-muted-foreground">{t("空闲")}</span>
              )}
            </div>
          </Card>
        </button>
      </section>

      {/* 继续上次操作：仅存在失败任务等可恢复上下文时出现 */}
      {lastDone && !lastDone.success && (
        <section className="mt-3">
          <Card className="flex items-center gap-3 border-destructive/40 bg-destructive/5 px-3.5 py-2.5">
            <XCircle className="size-4 shrink-0 text-destructive" />
            <span className="min-w-0 flex-1 truncate text-xs">
              {t("上次任务失败：")}{lastDone.id}
            </span>
            <Button variant="outline" size="sm" onClick={openPanel}>
              {t("查看日志")}
            </Button>
          </Card>
        </section>
      )}

      {/* 精选软件（编辑精选，固定 8 个） */}
      <section className="mt-6">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="m-0 text-sm font-semibold tracking-wide">
            {t("精选软件")}
            <span className="ml-2 text-[11px] font-normal text-muted-foreground">{t("编辑精选")}</span>
          </h2>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs text-muted-foreground"
            onClick={() => browse("all")}
          >
            {t("查看全部")} <ChevronRight className="size-3.5" />
          </Button>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
          {featuredApps.map((a) => (
            <AppCard key={a.id} app={a} state={cardState(a.id)} />
          ))}
        </div>
      </section>

      {/* AI 工具精选（3–4 个代表性项目，标示形态与密钥需求） */}
      {featuredAgents.length > 0 && (
        <section className="mt-6">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="m-0 text-sm font-semibold tracking-wide">
              {t("AI 工具精选")}
              <span className="ml-2 text-[11px] font-normal text-muted-foreground">{t("编辑精选")}</span>
            </h2>
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs text-muted-foreground"
              onClick={() => setTab("agents")}
            >
              {t("查看全部 ")}{AGENTS.length}{t(" 个")} <ChevronRight className="size-3.5" />
            </Button>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
            {featuredAgents.map((a) => (
              <AgentCard key={a.id} recipe={a} installed={agentsInstalled[a.id] === true} onOpen={() => pickAgent(a.id)} />
            ))}
          </div>
        </section>
      )}

      {/* 按用途浏览：分类入口 → 搜索页（带筛选条件的完整软件列表） */}
      <section className="mt-6">
        <h2 className="m-0 mb-3 text-sm font-semibold tracking-wide">{t("按用途浏览")}</h2>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Button key={c.id} variant="outline" size="sm" className="rounded-full" onClick={() => browse(c.id)}>
              {t(c.label)}
            </Button>
          ))}
        </div>
      </section>

      {/* 页脚：目录来源与官方渠道说明 */}
      <footer className="mt-8 border-t border-border pt-3 text-[10.5px] leading-5 text-muted-foreground/80">
        {catalogSource === "remote"
          ? t("目录来源：官网目录 API（实时更新） · ") + timeLabel(catalogAt)
          : t("目录来源：内置快照（联网后自动更新）")}
        {" · "}
        {t("安装均经 winget 官方源或软件官方发布渠道")}
      </footer>
    </div>
  );
}
