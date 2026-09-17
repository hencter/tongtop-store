/** 软件详情弹层（Radix Dialog）：winget 信息 + 官网 + GitHub 发布资产直链。 */

import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, Download, ExternalLink, Loader2, TrendingUp } from "lucide-react";
import { CATALOG_BY_ID } from "../catalog/apps";
import { useDetailStore } from "../state/detailStore";
import { useTaskStore } from "../state/taskStore";
import { useAppStore } from "../state/appStore";
import { useSettingsStore } from "../state/settingsStore";
import { formatDate, formatDownloads, formatSize, pickWindowsAssets } from "../domain/github";
import { AppIcon } from "./AppIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const GithubMark = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
  </svg>
);

export function DetailModal() {
  const detailId = useDetailStore((s) => s.detailId);
  const detail = useDetailStore((s) => s.detail);
  const loading = useDetailStore((s) => s.loading);
  const error = useDetailStore((s) => s.error);
  const gh = useDetailStore((s) => s.gh);
  const ghLoading = useDetailStore((s) => s.ghLoading);
  const ghError = useDetailStore((s) => s.ghError);
  const close = useDetailStore((s) => s.close);
  // 安装态感知：已安装 → 不再显示安装按钮；有可更新版本 → 变更新按钮
  const lid = (detailId ?? "").toLowerCase();
  const installedVersion = useAppStore((s) =>
    lid ? s.installed?.find((a) => a.id.toLowerCase() === lid)?.version : undefined,
  );
  const hasUpgrade = useAppStore((s) =>
    lid ? (s.upgrades?.some((u) => u.id.toLowerCase() === lid) ?? false) : false,
  );
  const action = hasUpgrade ? "upgrade" : "install";
  const taskState = useTaskStore((s) => s.taskState(`winget:${action}:${detailId}`));
  const runTask = useTaskStore((s) => s.runTask);
  const silent = useTaskStore((s) => s.silent);
  const ghProxy = useSettingsStore((s) => s.ghProxy);

  const catalog = detailId ? CATALOG_BY_ID.get(detailId.toLowerCase()) : undefined;
  const homepage = catalog?.site ?? (detail?.homepage || undefined);
  const name = catalog?.name ?? detail?.name ?? detailId ?? "";
  const desc = catalog?.desc ?? detail?.description;
  const ghAssets = gh ? pickWindowsAssets(gh.assets).slice(0, 4) : [];
  const proxied = (url: string) => (ghProxy ? ghProxy + url : url);

  return (
    <Dialog open={detailId !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <div className="flex items-center gap-3.5 border-b border-border p-5">
          <AppIcon id={detailId ?? ""} name={name} size={48} />
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2">
              {name}
              {catalog?.github && (
                <Badge variant="secondary">
                  <GithubMark className="size-3" /> GitHub 发布
                </Badge>
              )}
            </DialogTitle>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">{detailId}</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> 正在获取软件信息…
            </div>
          )}
          {error && <div className="text-sm text-destructive">{error}</div>}
          {detail && (
            <dl className="grid grid-cols-[72px_1fr] gap-x-4 gap-y-2 text-[13px]">
              {detail.version && (
                <>
                  <dt className="text-muted-foreground">版本</dt>
                  <dd>{detail.version}</dd>
                </>
              )}
              {detail.publisher && (
                <>
                  <dt className="text-muted-foreground">发布者</dt>
                  <dd>{detail.publisher}</dd>
                </>
              )}
              {desc && (
                <>
                  <dt className="text-muted-foreground">简介</dt>
                  <dd>{desc}</dd>
                </>
              )}
              {homepage && (
                <>
                  <dt className="text-muted-foreground">官方网站</dt>
                  <dd>
                    <Button variant="link" className="h-auto p-0 text-xs" onClick={() => void openUrl(homepage)}>
                      {homepage}
                    </Button>
                  </dd>
                </>
              )}
            </dl>
          )}

          {catalog?.github && (
            <section className="mt-4 rounded-lg border border-border bg-muted/40 p-3.5">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <GithubMark className="size-4" />
                <span className="font-semibold">GitHub 官方发布</span>
                {gh && (
                  <span className="text-xs text-muted-foreground">
                    {gh.tag} · {formatDate(gh.publishedAt)}
                  </span>
                )}
                <Button
                  variant="link"
                  className="ml-auto h-auto p-0 text-[11px]"
                  onClick={() => void openUrl(`https://github.com/${catalog.github}/releases`)}
                >
                  {catalog.github}
                </Button>
              </div>
              {ghLoading && (
                <div className="mt-2.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> 正在获取最新发布…
                </div>
              )}
              {ghError && <div className="mt-2.5 text-xs text-destructive">{ghError}</div>}
              {gh && ghAssets.length > 0 && (
                <div className="mt-2.5 flex flex-col gap-1.5">
                  {ghAssets.map((a) => (
                    <button
                      key={a.url}
                      className="flex items-center gap-2 rounded-md border border-border bg-transparent px-3 py-2 text-left transition-colors hover:border-primary/50 hover:bg-primary/10"
                      onClick={() => void openUrl(proxied(a.url))}
                      title={a.url}
                    >
                      <Download className="size-3.5 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1 truncate font-mono text-xs">{a.name}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatSize(a.size)}
                        {a.downloads > 0 && ` · ${formatDownloads(a.downloads)} 次下载`}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {gh && ghAssets.length === 0 && (
                <div className="mt-2.5 text-xs text-muted-foreground">该发布暂无 Windows 资产，请前往发布页查看。</div>
              )}
              {ghProxy && (
                <div className="mt-2 text-[11px] text-muted-foreground">经加速通道下载：{ghProxy}</div>
              )}
            </section>
          )}

          <p className="mt-4 rounded-lg bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
            本商店不托管安装包。安装经 winget 官方源下载；GitHub 直链与「前往官网」均指向软件官方发布渠道。
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-border p-4">
          {homepage && (
            <Button variant="outline" onClick={() => void openUrl(homepage)}>
              <ExternalLink className="size-3.5" /> 前往官网
            </Button>
          )}
          {installedVersion && !hasUpgrade ? (
            <Badge variant="outline" className="h-9 px-4 text-sm">
              <Check className="size-4 text-ok" /> 已安装 {installedVersion}
            </Badge>
          ) : (
            <Button
              disabled={taskState !== null}
              onClick={() => {
                const id = detailId!;
                close();
                void runTask(`winget:${action}:${id}`, {
                  kind: "winget",
                  action,
                  wingetId: id,
                  silent,
                  display: `${hasUpgrade ? "更新" : "安装"} ${name}`,
                });
              }}
            >
              {taskState ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : hasUpgrade ? (
                <TrendingUp className="size-3.5" />
              ) : (
                <Download className="size-3.5" />
              )}
              {hasUpgrade ? "更新" : "安装"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
