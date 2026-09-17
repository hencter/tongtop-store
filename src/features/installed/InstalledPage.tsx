/** 已安装页：SQLite 快照（毫秒级首渲）+ 后台刷新 + 陈旧时间显示。 */

import { RefreshCw } from "lucide-react";
import { CATALOG_BY_ID } from "../../catalog/apps";
import { useAppStore } from "../../state/appStore";
import { timeLabel } from "../../domain/format";
import { AppRow } from "../../components/AppRow";
import { VirtualList } from "../../components/VirtualList";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const ROW_H = 64;

export function InstalledPage() {
  const installed = useAppStore((s) => s.installed);
  const installedAt = useAppStore((s) => s.installedAt);
  const loading = useAppStore((s) => s.snapshotLoading);
  const refresh = useAppStore((s) => s.refreshSnapshot);

  return (
    <div className="page flex h-full flex-col">
      <header className="mb-1.5 flex items-center justify-between">
        <h2 className="m-0 text-lg font-semibold tracking-wide">
          已安装{installed ? `（${installed.length}）` : ""}
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground">{timeLabel(installedAt)}</span>
          <Button variant="outline" size="sm" onClick={() => void refresh(true)} disabled={loading}>
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> 刷新
          </Button>
        </div>
      </header>
      <p className="mb-2.5 text-xs text-muted-foreground">
        仅列出与 winget 源关联的软件（可由此更新/卸载）。数据来自本地快照索引，毫秒级加载。
      </p>

      {loading && !installed && (
        <div className="mt-2 flex flex-col gap-2.5">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-[54px]" />
          ))}
        </div>
      )}

      {installed && installed.length === 0 && (
        <div className="py-14 text-center text-muted-foreground">没有检测到已关联的软件。</div>
      )}

      {installed && installed.length > 0 && (
        <VirtualList
          className="min-h-0 flex-1"
          items={installed}
          rowHeight={ROW_H}
          renderRow={(info) => (
            <AppRow
              key={info.id}
              info={info}
              catalog={CATALOG_BY_ID.get(info.id.toLowerCase())}
              mode="uninstall"
            />
          )}
        />
      )}
    </div>
  );
}
