/** 更新页：快照首渲 + 一键更新全部（winget upgrade --all，确认后单任务流式执行）。
 *  忽略机制：每行可「忽略此版本 / 永久忽略」，被忽略的进底部「已忽略」区，可恢复。 */

import { useMemo, useState } from "react";
import { BellOff, RefreshCw, Rocket } from "lucide-react";
import { CATALOG_BY_ID } from "../../catalog/apps";
import { useAppStore } from "../../state/appStore";
import { useTaskStore } from "../../state/taskStore";
import { useNotesStore } from "../../state/notesStore";
import { useSettingsStore } from "../../state/settingsStore";
import { timeLabel } from "../../domain/format";
import { AppRow } from "../../components/AppRow";
import { VirtualList } from "../../components/VirtualList";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ROW_H = 64;

export function UpdatesPage() {
  const upgrades = useAppStore((s) => s.upgrades);
  const upgradesAt = useAppStore((s) => s.upgradesAt);
  const loading = useAppStore((s) => s.snapshotLoading);
  const refresh = useAppStore((s) => s.refreshSnapshot);
  const running = useTaskStore((s) => s.running);
  const runTask = useTaskStore((s) => s.runTask);
  const silent = useTaskStore((s) => s.silent);
  const openNotes = useNotesStore((s) => s.open);
  const ignored = useSettingsStore((s) => s.ignored);
  const unignore = useSettingsStore((s) => s.unignore);
  const [confirming, setConfirming] = useState(false);
  const [showIgnored, setShowIgnored] = useState(false);

  // 忽略规则：永久（"*"）或精确版本号命中即隐藏
  const { visible, hidden } = useMemo(() => {
    const vis = [];
    const hid = [];
    for (const u of upgrades ?? []) {
      const ig = ignored[u.id.toLowerCase()];
      if (ig === "*" || ig === u.available) hid.push(u);
      else vis.push(u);
    }
    return { visible: vis, hidden: hid };
  }, [upgrades, ignored]);

  const count = visible.length;

  // 标题栏搜索（本页作用域）：在可见更新里过滤名称 / ID
  const pageQuery = useAppStore((s) => s.pageQueries.updates ?? "");
  const q = pageQuery.trim().toLowerCase();
  const shown = q
    ? visible.filter(
        (u) => u.name.toLowerCase().includes(q) || u.id.toLowerCase().includes(q),
      )
    : visible;

  const upgradeAll = () => {
    setConfirming(false);
    void runTask("winget:upgrade-all", {
      kind: "winget",
      action: "upgrade_all" as never, // 见 Rust 侧 winget 分支
      silent,
      display: `一键更新全部（${count} 个）`,
    });
  };

  return (
    <div className="page flex h-full flex-col">
      <header className="mb-1.5 flex items-center justify-between">
        <h2 className="m-0 text-lg font-semibold tracking-wide">可更新{upgrades ? `（${count}）` : ""}</h2>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">{timeLabel(upgradesAt)}</span>
          <Button variant="outline" size="sm" onClick={() => void refresh(true)} disabled={loading}>
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> 刷新
          </Button>
          <Button size="sm" disabled={count === 0 || running !== null} onClick={() => setConfirming(true)}>
            <Rocket className="size-3.5" /> 一键更新
          </Button>
        </div>
      </header>

      {loading && !upgrades && (
        <div className="mt-2 flex flex-col gap-2.5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-[54px]" />
          ))}
        </div>
      )}

      {upgrades && count === 0 && (
        <div className="py-14 text-center text-muted-foreground">
          {hidden.length > 0 ? "没有待处理的更新（部分已忽略）。" : "所有软件都是最新版本。"}
        </div>
      )}

      {count > 0 && shown.length === 0 && (
        <div className="py-14 text-center text-muted-foreground">没有匹配「{pageQuery.trim()}」的待更新软件。</div>
      )}

      {shown.length > 0 && (
        <VirtualList
          className="min-h-0 flex-1"
          items={shown}
          rowHeight={ROW_H}
          renderRow={(info) => (
            <AppRow
              key={info.id}
              info={{ name: info.name, id: info.id, version: info.version }}
              available={info.available}
              catalog={CATALOG_BY_ID.get(info.id.toLowerCase())}
              mode="upgrade"
              onNotes={(id, name) => void openNotes(id, name)}
            />
          )}
        />
      )}

      {hidden.length > 0 && (
        <div className="mt-3 shrink-0 border-t border-border pt-2.5">
          <button
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowIgnored((v) => !v)}
          >
            <BellOff className="size-3.5" /> 已忽略（{hidden.length}）{showIgnored ? "收起" : "展开"}
          </button>
          {showIgnored && (
            <div className="mt-2 flex flex-col gap-1">
              {hidden.map((u) => (
                <div key={u.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="min-w-0 flex-1 truncate">
                    {CATALOG_BY_ID.get(u.id.toLowerCase())?.name ?? u.name}
                    <span className="ml-1.5">
                      {u.version} → {u.available}
                      {ignored[u.id.toLowerCase()] === "*" ? "（永久忽略）" : "（已忽略此版本）"}
                    </span>
                  </span>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => unignore(u.id)}>
                    恢复
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="w-[440px]">
          <DialogHeader>
            <DialogTitle>一键更新全部</DialogTitle>
            <DialogDescription>
              将依次更新 {count} 个软件（winget upgrade --all），过程可随时取消。
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-48 overflow-y-auto p-4 pt-0">
            <ul className="m-0 flex flex-col gap-1.5 pl-4 text-[13px] text-muted-foreground">
              {visible.slice(0, 8).map((u) => (
                <li key={u.id} className="truncate">
                  {CATALOG_BY_ID.get(u.id.toLowerCase())?.name ?? u.name}
                  <span className="text-foreground"> {u.version} → {u.available}</span>
                </li>
              ))}
              {count > 8 && <li>… 等共 {count} 个</li>}
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              再想想
            </Button>
            <Button onClick={upgradeAll}>
              <Rocket className="size-3.5" /> 开始更新
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
