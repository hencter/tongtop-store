/** 文件活动监控页：装了/启动了软件后，谁在往用户目录写东西。
 *  ReadDirectoryChangesW 监听 + 前两级目录聚合 + 会话期间新进程快照（逼近归因，如实标注）。 */

import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Activity, CirclePlay, CircleStop, FolderOpen, Loader2, Radar, RefreshCw } from "lucide-react";
import * as ipc from "../../ipc/client";
import type { ActivityBatch, ActivityGroup, ProcDto } from "../../ipc/types";
import { useAppStore } from "../../state/appStore";
import { useT } from "../../i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface RootOpt {
  label: string;
  path: string;
  on: boolean;
}

const DEFAULT_ROOTS: RootOpt[] = [
  { label: "AppData\\Roaming", path: "%APPDATA%", on: true },
  { label: "AppData\\Local", path: "%LOCALAPPDATA%", on: true },
  { label: "ProgramData", path: "%PROGRAMDATA%", on: false },
  { label: "文档", path: "%USERPROFILE%\\Documents", on: false },
];

interface FeedRow extends ActivityGroup {
  lastSeen: number;
}

export function ActivityPage() {
  const t = useT();
  const pageQuery = useAppStore((s) => s.pageQueries.activity ?? "");
  const [roots, setRoots] = useState(DEFAULT_ROOTS);
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [total, setTotal] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [feed, setFeed] = useState<FeedRow[]>([]);
  const [related, setRelated] = useState("");
  const [newProcs, setNewProcs] = useState<ProcDto[]>([]);
  const baseline = useRef<Set<number>>(new Set());
  const sessionStart = useRef<number>(0);

  // 启动时同步一次真实状态（可能上次离开页面时还在监听）
  useEffect(() => {
    void ipc.activityStatus().then(setActive);
  }, []);

  // 事件流：聚合批次 → 合并进 feed（同键累加、置顶、封顶 200）
  useEffect(() => {
    if (!active) return;
    const un = listen<ActivityBatch>("activity-batch", (e) => {
      setTotal(e.payload.total);
      setElapsed(e.payload.elapsedMs);
      setFeed((prev) => {
        const map = new Map(prev.map((r) => [r.key, r]));
        for (const g of e.payload.groups) {
          const old = map.get(g.key);
          map.delete(g.key);
          map.set(g.key, {
            key: g.key,
            count: (old?.count ?? 0) + g.count,
            latest: g.latest.length > 0 ? g.latest : (old?.latest ?? []),
            lastSeen: Date.now(),
          });
        }
        return [...map.values()].slice(0, 200);
      });
    });
    return () => {
      void un.then((f) => f());
    };
  }, [active]);

  // 新进程轮询（会话期间出现的）
  useEffect(() => {
    if (!active) return;
    const poll = async () => {
      const procs = await ipc.activityProcesses();
      const fresh = procs.filter(
        (p) => !baseline.current.has(p.pid) && p.startedMs >= sessionStart.current - 5000,
      );
      setNewProcs(fresh.sort((a, b) => b.startedMs - a.startedMs).slice(0, 30));
    };
    void poll();
    const t = setInterval(() => void poll(), 10_000);
    return () => clearInterval(t);
  }, [active]);

  const start = async () => {
    setStarting(true);
    try {
      // 基线：当前进程集合 + 会话起点
      const procs = await ipc.activityProcesses();
      baseline.current = new Set(procs.map((p) => p.pid));
      sessionStart.current = Date.now();
      setFeed([]);
      setTotal(0);
      setNewProcs([]);
      await ipc.activityStart(roots.filter((r) => r.on).map((r) => r.path));
      setActive(true);
    } finally {
      setStarting(false);
    }
  };

  const stop = async () => {
    await ipc.activityStop();
    setActive(false);
  };

  // 关联应用 token 高亮 + 标题栏搜索过滤
  const tokens = related
    .toLowerCase()
    .split(/[\s,，]+/)
    .filter((t) => t.length >= 3);
  const q = pageQuery.trim().toLowerCase();
  const shownFeed = feed.filter((r) => !q || r.key.toLowerCase().includes(q));
  const isRelated = (key: string) => tokens.some((t) => key.toLowerCase().includes(t));

  return (
    <div className="page flex h-full flex-col">
      <header className="mb-1.5 flex items-center justify-between">
        <h2 className="m-0 text-lg font-semibold tracking-wide">{t("活动监控")}</h2>
        <div className="flex items-center gap-2">
          {active && (
            <span className="text-[11px] text-muted-foreground">
              {Math.floor(elapsed / 1000)}s · {total} 个事件
            </span>
          )}
          {active ? (
            <Button variant="destructive" size="sm" onClick={() => void stop()}>
              <CircleStop className="size-3.5" /> 停止
            </Button>
          ) : (
            <Button size="sm" disabled={starting || roots.every((r) => !r.on)} onClick={() => void start()}>
              {starting ? <Loader2 className="size-3.5 animate-spin" /> : <CirclePlay className="size-3.5" />}
              开始监控
            </Button>
          )}
        </div>
      </header>
      <p className="mb-3 text-xs text-muted-foreground">
        监听用户目录的文件创建/修改/删除，按目录聚合。进程级精确归因需要管理员权限的内核驱动（ProcMon 领域）——
        这里用「新出现的进程 + 路径关联」逼近。已默认排除 Temp 等噪音目录。
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {roots.map((r) => (
          <label key={r.label} className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={r.on}
              disabled={active}
              onChange={() => setRoots(roots.map((x) => (x.label === r.label ? { ...x, on: !x.on } : x)))}
            />
            {r.label}
          </label>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <input
            className="h-8 w-56 rounded-md border border-input bg-transparent px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            placeholder="关联应用关键词（如 wechat tencent）"
            value={related}
            onChange={(e) => setRelated(e.target.value)}
          />
        </div>
      </div>

      {!active && feed.length === 0 && (
        <div className="py-14 text-center text-muted-foreground">
          <Radar className="mx-auto mb-3 size-10 opacity-40" />
          点「开始监控」，然后去安装/启动软件 —— 谁在后台写用户目录一目了然。
        </div>
      )}

      {active && shownFeed.length === 0 && (
        <div className="py-10 text-center text-sm text-muted-foreground">
          <Activity className="mx-auto mb-2 size-6 animate-pulse opacity-50" />
          监听中… 暂无可显示的文件活动
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[1fr_260px] gap-3">
        <Card className="min-h-0 overflow-y-auto p-3">
          {shownFeed.map((r) => (
            <div
              key={r.key}
              className={`mb-1.5 rounded-lg border p-2.5 ${
                isRelated(r.key) ? "border-primary/60 bg-primary/10" : "border-border"
              }`}
            >
              <div className="flex items-center gap-2">
                <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold">{r.key}</span>
                {isRelated(r.key) && <Badge variant="default">关联</Badge>}
                <Badge variant="secondary">{r.count} 次</Badge>
              </div>
              {r.latest[0] && (
                <div className="mt-1 truncate pl-5 font-mono text-[11px] text-muted-foreground" title={r.latest.join("\n")}>
                  最新：{r.latest[0]}
                </div>
              )}
            </div>
          ))}
        </Card>

        <Card className="min-h-0 overflow-y-auto p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-semibold">新出现的进程（{newProcs.length}）</span>
            <RefreshCw className="size-3.5 text-muted-foreground" />
          </div>
          {newProcs.length === 0 && (
            <div className="py-6 text-center text-[11px] text-muted-foreground">
              {active ? "会话期间暂无新进程" : "开始监控后自动跟踪"}
            </div>
          )}
          {newProcs.map((p) => (
            <div key={p.pid} className="flex items-center gap-2 border-t border-border py-1.5 text-xs first:border-t-0">
              <span className="min-w-0 flex-1 truncate font-mono">{p.name}.exe</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">pid {p.pid}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
