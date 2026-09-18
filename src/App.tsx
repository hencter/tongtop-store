import { useEffect, useState, type ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { listen } from "@tauri-apps/api/event";
import { Bot, BrushCleaning, Home, Package, PackageX, Radar, Search, Settings, TrendingUp, Zap } from "lucide-react";
import { useAppStore, type Tab } from "./state/appStore";
import { useMirrorStore } from "./state/mirrorStore";
import { useUpdateStore } from "./state/updateStore";
import { initTaskListeners } from "./state/taskStore";
import { wireAgentLog, useAgentStore } from "./state/agentStore";
import { HomePage } from "./features/home/HomePage";
import { SearchPage } from "./features/search/SearchPage";
import { AgentsPage } from "./features/agents/AgentsPage";
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

const NAV: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: "home", label: "首页", icon: Home },
  { id: "search", label: "搜索", icon: Search },
  { id: "agents", label: "AI 智能体", icon: Bot },
  { id: "mirrors", label: "镜像中心", icon: Zap },
  { id: "installed", label: "已安装", icon: Package },
  { id: "updates", label: "更新", icon: TrendingUp },
  { id: "cleanup", label: "缓存清理", icon: BrushCleaning },
  { id: "activity", label: "活动监控", icon: Radar },
];

function WingetMissing() {
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
        <h1 className="m-0 text-lg font-semibold">未检测到 winget</h1>
        <p className="m-0 max-w-[480px] text-sm leading-7 text-muted-foreground">
          应用商店通过 winget（微软「应用安装程序」）从官方源下载软件。请先安装它，然后点下方重新检测。
        </p>
        <div className="flex gap-3">
          <Button size="lg" onClick={() => void openUrl("https://apps.microsoft.com/detail/9NBLGGH4NNS1")}>
            前往微软商店安装「应用安装程序」
          </Button>
          <Button size="lg" variant="outline" disabled={checking} onClick={() => void recheck()}>
            {checking ? "检测中…" : "重新检测"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const tab = useAppStore((s) => s.tab);
  const setTab = useAppStore((s) => s.setTab);
  const wingetOk = useAppStore((s) => s.wingetOk);
  const checkWinget = useAppStore((s) => s.checkWinget);
  const loadSnapshot = useAppStore((s) => s.loadSnapshot);
  const refreshSnapshot = useAppStore((s) => s.refreshSnapshot);

  const [visited, setVisited] = useState<ReadonlySet<Tab>>(() => new Set([tab]));
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    // 后台探测已安装的智能体（bin + 开始菜单），不阻塞首屏
    void useAgentStore.getState().detectInstalled();
    void (async () => {
      await checkWinget();
      // 启动即后台跑一遍 winget 快照（陈旧才真跑），界面先读 SQLite 毫秒渲染
      const ok = useAppStore.getState().wingetOk;
      if (ok) {
        await loadSnapshot();
        void refreshSnapshot();
        // 傻瓜化：后台自动镜像测速（挑最快的自动应用），不打扰界面
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
          <nav className="flex flex-1 flex-col gap-1">
            {NAV.map((n) => (
              <button
                key={n.id}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] transition-colors ${
                  tab === n.id
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
                onClick={() => setTab(n.id)}
              >
                <n.icon className="size-4" />
                {n.label}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2 border-t border-border px-3 pt-3 text-[11.5px] text-muted-foreground">
            <span className={`size-2 rounded-full ${wingetOk ? "bg-ok" : "bg-muted-foreground"}`} />
            winget {wingetOk ? "已就绪" : "检测中…"}
            <button
              className="ml-auto rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => setSettingsOpen(true)}
              title="设置"
            >
              <Settings className="size-3.5" />
            </button>
          </div>
        </aside>

        <main className="min-h-0 min-w-0 flex-1">
          {page("home", <HomePage />)}
          {page("search", <SearchPage />)}
          {page("agents", <AgentsPage />)}
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
