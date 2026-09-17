/** 首页：AI 智能体精选 + 软件分类目录（静态数据，首屏零 IPC）+ 分类筛选。 */

import { memo, useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, ChevronRight, Clock, Download, ExternalLink, Loader2, Play, Rocket, Search, TrendingUp } from "lucide-react";
import { AppLogo } from "../../components/AppLogo";
import { CATALOG, CATEGORIES, type CatalogApp, type CategoryId } from "../../catalog/apps";
import { AGENTS, type AgentRecipe } from "../../catalog/agents";
import { useAppStore } from "../../state/appStore";
import { useAgentStore } from "../../state/agentStore";
import { useTaskStore } from "../../state/taskStore";
import { AppIcon } from "../../components/AppIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type CardState = "none" | "installed" | "upgrade";

const AppCard = memo(function AppCard({ app, state }: { app: CatalogApp; state: CardState }) {
  const runTask = useTaskStore((s) => s.runTask);
  const silent = useTaskStore((s) => s.silent);
  // 已安装则不再显示安装按钮；有可更新版本 → 安装按钮变为更新按钮
  const action = state === "upgrade" ? "upgrade" : "install";
  const taskId = `winget:${action}:${app.id}`;
  const taskState = useTaskStore((s) => s.taskState(taskId));
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
          <Badge variant="outline" className="h-8 px-3 text-xs">
            <Check className="size-3.5 text-ok" /> 已安装
          </Badge>
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
                <Loader2 className="size-3.5 animate-spin" /> 进行中
              </>
            ) : taskState === "queued" ? (
              <>
                <Clock className="size-3.5" /> 排队中
              </>
            ) : state === "upgrade" ? (
              <>
                <TrendingUp className="size-3.5" /> 更新
              </>
            ) : (
              <>
                <Download className="size-3.5" /> 安装
              </>
            )}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => void openUrl(app.site)} title={app.site}>
          <ExternalLink className="size-3.5" /> 官网
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
  return (
    <Card className="flex flex-col gap-1.5 p-4 transition-colors hover:border-foreground/20">
      <div className="flex items-start justify-between">
        <AppIcon id={`agent:${recipe.id}`} name={recipe.name} size={42} />
        {installed && (
          <Badge variant="outline">
            <Check className="size-3.5 text-ok" /> 已安装
          </Badge>
        )}
      </div>
      <div className="mt-1 font-semibold">{recipe.name}</div>
      <div className="line-clamp-2 h-8 text-xs text-muted-foreground" title={recipe.desc}>
        {recipe.desc}
      </div>
      <div className="text-[11px] text-muted-foreground">{recipe.vendor}</div>
      <div className="mt-1.5 flex gap-2">
        <Button size="sm" className="flex-1" onClick={onOpen}>
          {installed ? (
            <>
              <Play className="size-3.5" /> 打开
            </>
          ) : (
            <>
              <Rocket className="size-3.5" /> 一键装机
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
  const setTab = useAppStore((s) => s.setTab);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const installed = useAppStore((s) => s.installed);
  const upgrades = useAppStore((s) => s.upgrades);
  const openAgent = useAgentStore((s) => s.open);
  const agentsInstalled = useAgentStore((s) => s.installedMap);
  const [cat, setCat] = useState<CategoryId | "all">("all");
  const shown = cat === "all" ? CATEGORIES : CATEGORIES.filter((c) => c.id === cat);

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
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground">
          <AppLogo className="size-6" />
        </div>
        <h1 className="m-0 text-2xl font-semibold tracking-tight">应用商店</h1>
        <p className="mb-5 mt-2 text-sm text-muted-foreground">
          不托管任何安装包，只做官方软件下载链接的分发
        </p>
        <div className="mx-auto flex h-10 max-w-[540px] items-center gap-2.5 rounded-md border border-input bg-background px-3 text-muted-foreground transition-shadow focus-within:ring-2 focus-within:ring-ring/40">
          <Search className="size-4" />
          <input
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            placeholder="搜索软件，回车直达…"
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
            全部
          </Button>
          {CATEGORIES.map((c) => (
            <Button
              key={c.id}
              variant={cat === c.id ? "default" : "outline"}
              size="sm"
              className="rounded-full"
              onClick={() => setCat(c.id)}
            >
              {c.label}
            </Button>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-3.5 flex items-baseline justify-between">
          <h2 className="m-0 text-sm font-semibold tracking-wide">AI 智能体</h2>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs text-muted-foreground"
            onClick={() => setTab("agents")}
          >
            查看全部 {AGENTS.length} 个 <ChevronRight className="size-3.5" />
          </Button>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
          {AGENTS.map((a) => (
            <AgentCard key={a.id} recipe={a} installed={agentsInstalled[a.id] === true} onOpen={() => pickAgent(a.id)} />
          ))}
        </div>
      </section>

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
    </div>
  );
}
