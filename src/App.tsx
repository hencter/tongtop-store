import { useEffect, useState, type ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { listen } from "@tauri-apps/api/event";
import { Bot, BrushCleaning, ChevronDown, ChevronRight, GitFork, Home, ListChecks, Loader2, Package, PackageX, Radar, Search, Settings, TrendingUp, Zap } from "lucide-react";
import { useAppStore, type Tab } from "./state/appStore";
import { useCatalogStore } from "./state/catalogStore";
import { useMirrorStore } from "./state/mirrorStore";
import { useTaskStore } from "./state/taskStore";
import { useUpdateStore } from "./state/updateStore";
import { useT } from "./i18n";
import * as ipc from "./ipc/client";
import { initTaskListeners } from "./state/taskStore";
import { wireAgentLog, useAgentStore } from "./state/agentStore";
import { HomePage } from "./features/home/HomePage";
import { SearchPage } from "./features/search/SearchPage";
import { AgentsPage } from "./features/agents/AgentsPage";
import { GitHubPage } from "./features/github/GitHubPage";
import { MirrorsPage } from "./features/mirrors/MirrorsPage";
import { InstalledPage } from "./features/installed/InstalledPage";
import { UpdatesPage } from "./features/updates/UpdatesPage";
import { CleanupPage } from "./features/cleanup/CleanupPage";
import { ActivityPage } from "./features/activity/ActivityPage";
import { TaskPanel } from "./components/TaskPanel";
import { DetailModal } from "./components/DetailModal";
import { NotesDialog } from "./components/NotesDialog";
import { LeftoverDialog } from "./components/LeftoverDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { SelfUpdateDialog } from "./components/SelfUpdateDialog";
import { Titlebar } from "./components/Titlebar";
import { Button } from "@/components/ui/button";
import "./styles/global.css";

/** 导航信息架构（issue #16）：按任务分三区——发现软件 / 我的电脑 / 工具与维护（可折叠）。 */
const NAV_SECTIONS: { title: string; collapsible?: boolean; items: { id: Tab; label: string; icon: typeof Home }[] }[] = [
  {
    title: "发现",
    items: [
      { id: "home", label: "首页", icon: Home },
      { id: "search", label: "软件搜索", icon: Search },
      { id: "agents", label: "AI 智能体", icon: Bot },
      { id: "github", label: "GitHub 开源", icon: GitFork },
    ],
  },
  {
    title: "我的电脑",
    items: [
      { id: "installed", label: "已安装", icon: Package },
      { id: "updates", label: "软件更新", icon: TrendingUp },
    ],
  },
  {
    title: "工具与维护",
    collapsible: true,
    items: [
      { id: "mirrors", label: "镜像中心", icon: Zap },
      { id: "cleanup", label: "安装包缓存", icon: BrushCleaning },
      { id: "activity", label: "活动监控", icon: Radar },
    ],
  },
];

/** 侧边栏任务入口：有任务在跑/排队时常驻可见，点击展开任务面板（issue #16）。 */
function TaskEntry() {
  const t = useT();
  const running = useTaskStore((s) => s.running);
  const queueLen = useTaskStore((s) => s.queue.length);
  const openPanel = useTaskStore((s) => s.openPanel);
  if (!running && queueLen === 0) return null;
  return (
    <button
      className="mb-2 flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-left text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      onClick={openPanel}
      title={t("查看任务")}
    >
      {running ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
      ) : (
        <ListChecks className="size-3.5 shrink-0 text-primary" />
      )}
      <span className="min-w-0 flex-1 truncate">
        {running ? running.label : t("队列等待中")}
        {queueLen > 0 && ` +${queueLen}`}
      </span>
    </button>
  );
}

function WingetMissing() {
  const t = useT();
  const checkWinget = useAppStore((s) => s.checkWinget);
  const [checking, setChecking] = useState(false);
  const recheck = async () => {
    setChecking(true);
    await checkWinget();
    setChecking(false);
    // 检测成功：补上启动时跳过的快照加载（首次渲染毫秒级，后台再刷新）
    if (useAppStore.getState().wingetOk) {
      const { loadSnapshot, refreshSnapshot } = useAppStore.getState();
      await loadSnapshot();
      void refreshSnapshot();
    }
  };
  return (
    <div className="flex h-full flex-col">
      <Titlebar />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
        <div className="grid size-14 place-items-center rounded-full bg-muted">
          <PackageX className="size-7 text-muted-foreground" />
        </div>
        <h1 className="m-0 text-lg font-semibold">{t("未检测到 winget")}</h1>
        <p className="m-0 max-w-[480px] text-sm leading-7 text-muted-foreground">
          {t("应用商店通过 winget（微软「应用安装程序」）从官方源下载软件。请先安装它，然后点下方重新检测。")}
        </p>
        <div className="flex gap-3">
          <Button size="lg" onClick={() => void openUrl("https://apps.microsoft.com/detail/9NBLGGH4NNS1")}>
            {t("前往微软商店安装「应用安装程序」")}
          </Button>
          <Button size="lg" variant="outline" disabled={checking} onClick={() => void recheck()}>
            {checking ? t("检测中…") : t("重新检测")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const t = useT();
  const tab = useAppStore((s) => s.tab);
  const setTab = useAppStore((s) => s.setTab);
  const wingetOk = useAppStore((s) => s.wingetOk);
  const checkWinget = useAppStore((s) => s.checkWinget);
  const loadSnapshot = useAppStore((s) => s.loadSnapshot);
  const refreshSnapshot = useAppStore((s) => s.refreshSnapshot);

  const [visited, setVisited] = useState<ReadonlySet<Tab>>(() => new Set([tab]));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(true);

  useEffect(() => {
    // 后台探测已安装的智能体（bin + 开始菜单），不阻塞首屏
    void useAgentStore.getState().detectInstalled();
    // 首页推荐核心：启动即后台拉取网站 API 最新目录（内置数据已先渲染，拉到即换）
    void useCatalogStore.getState().refresh();
    // 上次自动更新若失败（安装器非零退出），启动即如实提示
    void ipc.takeUpdateError().then((msg) => {
      if (msg) useUpdateStore.setState({ error: msg, open: true });
    });
    void (async () => {
      await checkWinget();
      // 启动即后台跑一遍 winget 快照（陈旧才真跑），界面先读 SQLite 毫秒渲染
      const ok = useAppStore.getState().wingetOk;
      if (ok) {
        await loadSnapshot();
        void refreshSnapshot();
        // 后台镜像测速（只读产出推荐；仅在设置里显式开启「自动切换源」才会修改其他工具配置，issue #21）
        void useMirrorStore.getState().autoTune();
        // 自更新：静默检查 GitHub Releases（有新版本才弹窗）
        void useUpdateStore.getState().check(false);
      }
    })();
    const unTask = initTaskListeners();
    const unAgent = wireAgentLog();
    // 托盘菜单「镜像自动测速」
    const unTune = listen("mirror-autotune", () => void useMirrorStore.getState().autoTune());
    return () => {
      unTask();
      unAgent();
      void unTune.then((f) => f());
    };
  }, [checkWinget, loadSnapshot, refreshSnapshot]);

  // keep-alive：首次进入某页才挂载（保留懒加载），之后常驻只隐藏 ——
  // 滚动位置、页内状态不丢，镜像/清理页也不会每次进入都重跑检测 IPC
  useEffect(() => {
    setVisited((v) => (v.has(tab) ? v : new Set(v).add(tab)));
  }, [tab]);

  if (wingetOk === false) return <WingetMissing />;

  const page = (id: Tab, node: ReactNode) =>
    visited.has(id) ? <div className={tab === id ? "h-full" : "hidden"}>{node}</div> : null;

  return (
    <div className="flex h-full flex-col">
      <Titlebar />
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[190px] shrink-0 flex-col border-r border-border px-2.5 py-3">
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
            {NAV_SECTIONS.map((sec) => {
              const open = !sec.collapsible || toolsOpen;
              return (
                <div key={sec.title} className="flex flex-col gap-1">
                  {sec.collapsible ? (
                    <button
                      className="mt-2 flex items-center gap-1 px-3 py-1 text-[11px] font-medium tracking-wide text-muted-foreground/80 hover:text-foreground"
                      onClick={() => setToolsOpen((v) => !v)}
                      aria-expanded={toolsOpen}
                    >
                      {toolsOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                      {t(sec.title)}
                    </button>
                  ) : (
                    <div className="mt-2 px-3 py-1 text-[11px] font-medium tracking-wide text-muted-foreground/80 first:mt-0">
                      {t(sec.title)}
                    </div>
                  )}
                  {open &&
                    sec.items.map((n) => (
                      <button
                        key={n.id}
                        className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] transition-colors ${
                          tab === n.id
                            ? "bg-accent font-medium text-accent-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        }`}
                        aria-current={tab === n.id ? "page" : undefined}
                        onClick={() => setTab(n.id)}
                      >
                        <n.icon className="size-4" />
                        {t(n.label)}
                      </button>
                    ))}
                </div>
              );
            })}
          </nav>
          <TaskEntry />
          <div className="flex items-center gap-2 border-t border-border px-3 pt-3 text-[11.5px] text-muted-foreground">
            <span className={`size-2 rounded-full ${wingetOk ? "bg-ok" : "bg-muted-foreground"}`} />
            winget {wingetOk ? t("已就绪") : t("检测中…")}
            <button
              className="ml-auto rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => setSettingsOpen(true)}
              title={t("设置")}
            >
              <Settings className="size-3.5" />
            </button>
          </div>
        </aside>

        <main className="min-h-0 min-w-0 flex-1">
          {page("home", <HomePage />)}
          {page("search", <SearchPage />)}
          {page("agents", <AgentsPage />)}
          {page("github", <GitHubPage />)}
          {page("mirrors", <MirrorsPage />)}
          {page("installed", <InstalledPage />)}
          {page("updates", <UpdatesPage />)}
          {page("cleanup", <CleanupPage />)}
          {page("activity", <ActivityPage />)}
        </main>
      </div>

      <TaskPanel />
      <DetailModal />
      <NotesDialog />
      <LeftoverDialog />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <SelfUpdateDialog />
    </div>
  );
}
