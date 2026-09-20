/** 首页：AI 智能体精选 + 软件分类目录（静态数据，首屏零 IPC）+ 分类筛选。 */

import { memo, useEffect, useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, ChevronRight, Clock, Download, ExternalLink, Loader2, Play, Rocket, Search, Trash2, TrendingUp } from "lucide-react";
import { AppLogo } from "../../components/AppLogo";
import { type CatalogApp, type CategoryId } from "../../catalog/apps";
import { CONCERN_CAUTION, type AgentRecipe } from "../../catalog/agents";
import { useCatalogStore } from "../../state/catalogStore";
import { useAppStore } from "../../state/appStore";
import { deepUninstall } from "../../state/leftoverStore";
import { useAgentStore } from "../../state/agentStore";
import { useTaskStore } from "../../state/taskStore";
import { timeLabel } from "../../domain/format";
import { useT } from "../../i18n";
import { AppIcon } from "../../components/AppIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type CardState = "none" | "installed" | "upgrade";

const AppCard = memo(function AppCard({ app, state }: { app: CatalogApp; state: CardState }) {
  const t = useT();
  const runTask = useTaskStore((s) => s.runTask);
  const silent = useTaskStore((s) => s.silent);
  // 已安装 → 按钮变卸载（深度卸载：winget 卸载 + 注册表/AppData 残留扫描）；
  // 有可更新版本 → 安装按钮变更新按钮
  const action = state === "upgrade" ? "upgrade" : "install";
  const taskId = `winget:${action}:${app.id}`;
  const taskState = useTaskStore((s) => s.taskState(taskId));
  const uninstallState = useTaskStore((s) => s.taskState(`winget:uninstall:${app.id}`));
  return (
    <Card className="flex flex-col gap-1.5 p-4 transition-colors hover:border-foreground/20">
      <div className="flex items-start justify-between">
        <AppIcon id={app.id} name={app.name} size={42} />
        {app.github && <Badge variant="secondary">GitHub</Badge>}
      </div>
      <div className="mt-1 font-semibold">{app.name}</div>
      <div className="line-clamp-2 h-8 text-xs text-muted-foreground" title={app.desc}>
        {app.desc}
      </div>
      <div className="text-[11px] text-muted-foreground">{new URL(app.site).host}</div>
      <div className="mt-1.5 flex gap-2">
        {state === "installed" ? (
          <Button
            variant="destructive"
            size="sm"
            disabled={uninstallState !== null}
            title={t("已安装 —— 点击卸载（卸载后扫描注册表与 AppData 残留）")}
            onClick={() => void deepUninstall(app.id, app.name)}
          >
            {uninstallState === "running" ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> {t("进行中")}
              </>
            ) : uninstallState === "queued" ? (
              <>
                <Clock className="size-3.5" /> {t("排队中")}
              </>
            ) : (
              <>
                <Trash2 className="size-3.5" /> {t("卸载")}
              </>
            )}
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
          {recipe.concerns && (
            <Badge
              variant="outline"
              className="border-gold/40 text-[10px] text-gold"
              title={recipe.concerns.map((c) => CONCERN_CAUTION[c]).join("\n")}
            >
              风险提示
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
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const installed = useAppStore((s) => s.installed);
  const upgrades = useAppStore((s) => s.upgrades);
  const openAgent = useAgentStore((s) => s.open);
  const agentsInstalled = useAgentStore((s) => s.installedMap);
  const pageQuery = useAppStore((s) => s.pageQueries.home ?? "");
  // 目录数据：内置首屏 + 网站 API 实时更新（catalogStore 统一持有）
  const CATALOG = useCatalogStore((s) => s.apps);
  const AGENTS = useCatalogStore((s) => s.agents);
  const CATEGORIES = useCatalogStore((s) => s.categories);
  const catalogAt = useCatalogStore((s) => s.updatedAt);
  const catalogSource = useCatalogStore((s) => s.source);
  const tab = useAppStore((s) => s.tab);
  const [cat, setCat] = useState<CategoryId | "all">("all");

  // 首页推荐是核心内容：每次回到首页都触发一次目录刷新（store 内 5 分钟冷却）
  useEffect(() => {
    if (tab === "home") void useCatalogStore.getState().refresh();
  }, [tab]);
  const shown = cat === "all" ? CATEGORIES : CATEGORIES.filter((c) => c.id === cat);
  // 智能体区也参与分类筛选：选具体分类后不再占位（否则被选分类被顶到视口外，感觉像没切换）
  const showAgents = cat === "all" || cat === "ai";

  // 标题栏搜索（本页作用域）：非空时筛目录与智能体，替换分类分区展示
  const q = pageQuery.trim().toLowerCase();
  const filteredApps = q
    ? CATALOG.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q) ||
          a.desc.toLowerCase().includes(q) ||
          a.tags?.some((t) => t.toLowerCase().includes(q)),
      )
    : null;
  const filteredAgents = q
    ? AGENTS.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.vendor.toLowerCase().includes(q) ||
          a.desc.toLowerCase().includes(q),
      )
    : [];

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

  return (
    <div className="page h-full overflow-y-auto">
      <section className="pb-2 pt-6 text-center">
        <AppLogo className="mx-auto mb-4 size-14 rounded-xl" />
        <h1 className="m-0 text-2xl font-semibold tracking-tight">应用商店</h1>
        <p className="mb-5 mt-2 text-sm text-muted-foreground">
          {t("不托管任何安装包，只做官方软件下载链接的分发")}
        </p>
        <p className="mb-3 -mt-3 text-[10px] text-muted-foreground/70">
          {catalogSource === "remote" ? t("推荐内容实时更新 · ") + timeLabel(catalogAt) : t("推荐内容：内置快照（联网后自动更新）")}
        </p>
        <div className="mx-auto flex h-10 max-w-[540px] items-center gap-2.5 rounded-md border border-input bg-background px-3 text-muted-foreground transition-shadow focus-within:ring-2 focus-within:ring-ring/40">
          <Search className="size-4" />
          <input
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            placeholder={t("搜索软件，回车直达…")}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const q = e.currentTarget.value.trim();
                if (q) {
                  setTab("search");
                  setSearchQuery(q);
                }
              }
            }}
          />
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button
            variant={cat === "all" ? "default" : "outline"}
            size="sm"
            className="rounded-full"
            onClick={() => setCat("all")}
          >
            {t("全部")}
          </Button>
          {CATEGORIES.map((c) => (
            <Button
              key={c.id}
              variant={cat === c.id ? "default" : "outline"}
              size="sm"
              className="rounded-full"
              onClick={() => setCat(c.id)}
            >
              {t(c.label)}
            </Button>
          ))}
        </div>
      </section>

      {filteredApps ? (
        <section className="mt-8">
          <h2 className="mb-3.5 text-sm font-semibold tracking-wide">
            {t("筛选结果（")}{filteredAgents.length + filteredApps.length}）
          </h2>
          {filteredAgents.length + filteredApps.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {t("本页没有「")}{pageQuery.trim()}{t("」相关内容 —— 试试切换到「搜索」页查 winget 全量源。")}
            </div>
          ) : (
            <>
              {filteredAgents.length > 0 && (
                <div className="mb-3 grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
                  {filteredAgents.map((a) => (
                    <AgentCard
                      key={a.id}
                      recipe={a}
                      installed={agentsInstalled[a.id] === true}
                      onOpen={() => pickAgent(a.id)}
                    />
                  ))}
                </div>
              )}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
                {filteredApps.map((a) => (
                  <AppCard key={a.id} app={a} state={cardState(a.id)} />
                ))}
              </div>
            </>
          )}
        </section>
      ) : (
        <>
          {showAgents && (
          <section className="mt-8">
            <div className="mb-3.5 flex items-baseline justify-between">
              <h2 className="m-0 text-sm font-semibold tracking-wide">{t("AI 智能体 · 桌面端")}</h2>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs text-muted-foreground"
                onClick={() => setTab("agents")}
              >
                {t("查看全部 ")}{AGENTS.length}{t(" 个（含 CLI 端）")} <ChevronRight className="size-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
              {/* 首页只放桌面端智能体（CLI 端在智能体页） */}
              {AGENTS.filter((a) => a.desktopNames).map((a) => (
                <AgentCard key={a.id} recipe={a} installed={agentsInstalled[a.id] === true} onOpen={() => pickAgent(a.id)} />
              ))}
            </div>
          </section>
          )}

          {shown.map((c) => {
            // AI 分类聚合：AI 原生应用 + 带 AI 功能的常规软件
            const apps =
              c.id === "ai"
                ? CATALOG.filter((a) => a.category === "ai" || a.ai === true)
                : CATALOG.filter((a) => a.category === c.id);
            if (apps.length === 0) return null;
            return (
              <section key={c.id} className="mt-7">
                <h2 className="mb-3.5 text-sm font-semibold tracking-wide">
                  {c.label}
                </h2>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
                  {apps.map((a) => (
                    <AppCard key={a.id} app={a} state={cardState(a.id)} />
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
