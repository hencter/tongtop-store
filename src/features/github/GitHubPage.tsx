/** GitHub 专区（issue #20）：目录中开源在 GitHub 的软件聚合视图。
 *  主操作统一为 winget 安装（商店可跟踪安装状态与更新）；
 *  Release 直链下载为次级入口，明确标注「不由商店安装/跟踪更新」；
 *  直链受「镜像中心 → GitHub 下载加速」代理设置影响（加速只作用于该下载链路）。
 *  下载次数仅作热度参考，不构成安全或质量背书。 */

import { useEffect } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, Download, ExternalLink, Loader2, RefreshCw, Tag } from "lucide-react";
import { ghRepos, useGithubZoneStore } from "../../state/githubZoneStore";
import { useCatalogStore } from "../../state/catalogStore";
import { useAppStore } from "../../state/appStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useTaskStore, MAX_QUEUE } from "../../state/taskStore";
import { timeLabel } from "../../domain/format";
import { formatDate, formatDownloads, formatSize, pickWindowsAssets } from "../../domain/github";
import { AppIcon } from "../../components/AppIcon";
import { PageFilter } from "../../components/PageFilter";
import { useT } from "../../i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const GithubMark = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
  </svg>
);

function RepoCard({ id, name, repo, desc }: { id: string; name: string; repo: string; desc: string }) {
  const t = useT();
  const release = useGithubZoneStore((s) => s.releases[repo]);
  const error = useGithubZoneStore((s) => s.errors[repo]);
  const lid = id.toLowerCase();
  const installedVersion = useAppStore((s) => s.installed?.find((a) => a.id.toLowerCase() === lid)?.version);
  const taskState = useTaskStore((s) => s.taskState(`winget:install:${id}`));
  const queueFull = useTaskStore((s) => s.running !== null && s.queue.length >= MAX_QUEUE);
  const runTask = useTaskStore((s) => s.runTask);
  const silent = useTaskStore((s) => s.silent);
  const ghProxy = useSettingsStore((s) => s.ghProxy);

  const asset = release ? pickWindowsAssets(release.assets)[0] : undefined;
  const totalDownloads = release?.assets.reduce((sum, a) => sum + a.downloads, 0) ?? 0;
  const proxied = (url: string) => (ghProxy ? ghProxy + url : url);

  return (
    <Card className="flex flex-col gap-2.5 p-4">
      <div className="flex items-center gap-3">
        <AppIcon id={id} name={name} size={40} />
        <div className="min-w-0">
          <div className="truncate font-semibold">{name}</div>
          <button
            className="flex items-center gap-1 truncate text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => void openUrl(`https://github.com/${repo}`)}
            title={`https://github.com/${repo}`}
          >
            <GithubMark className="size-3 shrink-0" /> {repo}
          </button>
        </div>
        <div className="ml-auto shrink-0">
          {installedVersion ? (
            <Badge variant="outline">
              <Check className="size-3 text-ok" /> {t("已安装")}
            </Badge>
          ) : (
            <Badge variant="secondary">{t("开源")}</Badge>
          )}
        </div>
      </div>

      <div className="min-h-8 text-xs text-muted-foreground">{desc}</div>

      {/* Release 信息：最新发布版本/日期与本机安装版本分行，不混淆 */}
      <div className="rounded-md bg-muted px-2.5 py-2 text-[11px] text-muted-foreground">
        {!release && !error && (
          <span className="flex items-center gap-1.5">
            <Loader2 className="size-3 animate-spin" /> {t("正在获取最新发布…")}
          </span>
        )}
        {error && <span className="text-destructive">{t("获取失败：")}{error}</span>}
        {release && (
          <span className="flex items-center gap-1.5">
            <Tag className="size-3 shrink-0 text-primary" />
            {t("最新发布 ")}<span className="font-medium text-foreground">{release.tag}</span>
            <span>· {formatDate(release.publishedAt)}</span>
            {totalDownloads > 0 && (
              <span className="ml-auto" title={t("下载次数仅作热度参考，不构成安全或质量背书")}>
                {formatDownloads(totalDownloads)}{t(" 次下载")}
              </span>
            )}
          </span>
        )}
        {installedVersion && (
          <div className="mt-1 flex items-center gap-1.5">
            <Check className="size-3 shrink-0 text-ok" />
            {t("本机已装 ")}<span className="font-medium text-foreground">v{installedVersion}</span>
          </div>
        )}
      </div>

      {/* 主操作：winget 安装（可跟踪状态与更新）；直链下载为次级入口 */}
      <div className="mt-auto flex flex-col gap-1.5">
        <div className="flex gap-2">
          {!installedVersion ? (
            <Button
              size="sm"
              className="flex-1"
              disabled={taskState !== null || queueFull}
              onClick={() =>
                void runTask(`winget:install:${id}`, {
                  kind: "winget",
                  action: "install",
                  wingetId: id,
                  silent,
                  display: `安装 ${name}`,
                })
              }
            >
              {taskState === "running" ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              {t("winget 安装")}
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="flex-1" disabled>
              <Check className="size-3.5 text-ok" /> {t("已安装（在「已安装」页管理）")}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => void openUrl(`https://github.com/${repo}/releases`)}
            title={t("发行说明与全部资产")}
          >
            <ExternalLink className="size-3.5" /> {t("发布页")}
          </Button>
        </div>
        {asset ? (
          <Button
            variant="ghost"
            size="sm"
            className="min-w-0 justify-start text-muted-foreground"
            onClick={() => void openUrl(proxied(asset.url))}
            title={`${t("直链下载：只下载安装包，不会由商店安装或跟踪更新")}${ghProxy ? `\n${t("经第三方加速：")}${ghProxy}` : ""}\n${asset.url}`}
          >
            <Download className="size-3.5 shrink-0" />
            <span className="truncate font-mono text-[11px]">{asset.name}</span>
            <span className="shrink-0 text-[10px]">{formatSize(asset.size)}</span>
          </Button>
        ) : (
          release && (
            <div className="text-[11px] text-muted-foreground">
              {t("该发布暂无 Windows 资产 —— 请到发布页查看其他平台版本。")}
            </div>
          )
        )}
      </div>
    </Card>
  );
}

export function GitHubPage() {
  const t = useT();
  const fetchAll = useGithubZoneStore((s) => s.fetchAll);
  const loading = useGithubZoneStore((s) => s.loading);
  const loadedOnce = useGithubZoneStore((s) => s.loadedOnce);
  const fetchedAt = useGithubZoneStore((s) => s.fetchedAt);
  const pageQuery = useAppStore((s) => s.pageQueries.github ?? "");
  // 目录随 API 更新时专区条目跟着刷新（订阅 catalog 触发重渲染）
  useCatalogStore((s) => s.apps);
  const GH_REPOS = ghRepos();

  // 首次进入拉取（之后命中会话缓存，手动刷新才重拉 —— 匿名限流 60 次/小时）
  useEffect(() => {
    if (!useGithubZoneStore.getState().loadedOnce) void fetchAll();
  }, [fetchAll]);

  const q = pageQuery.trim().toLowerCase();
  const shown = q
    ? GH_REPOS.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.repo.toLowerCase().includes(q) ||
          g.id.toLowerCase().includes(q) ||
          g.desc.toLowerCase().includes(q),
      )
    : GH_REPOS;

  return (
    <div className="page flex h-full flex-col">
      <header className="mb-1.5 flex items-center justify-between">
        <h2 className="m-0 flex items-center gap-2 text-lg font-semibold tracking-wide">
          <GithubMark className="size-5" /> GitHub 专区
        </h2>
        <div className="flex items-center gap-3">
          <PageFilter tab="github" placeholder="筛选本页项目…" />
          {fetchedAt > 0 && (
            <span className="text-[11px] text-muted-foreground">{timeLabel(Math.floor(fetchedAt / 1000))}</span>
          )}
          <Button variant="outline" size="sm" onClick={() => void fetchAll(true)} disabled={loading}>
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> {t("刷新")}
          </Button>
        </div>
      </header>
      <p className="mb-4 text-xs text-muted-foreground">
        {t("这里收录开源在 GitHub 的软件，Release 即官方发布渠道。")}
        {t("主操作统一为 winget 安装（商店可跟踪安装状态与后续更新）；直链下载只是拿回安装包，不会由商店安装或跟踪更新。")}
        {t("第三方加速只作用于直链下载链路（镜像中心开启）；winget 安装始终走官方源。")}
      </p>

      {!loadedOnce && loading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[190px]" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="py-14 text-center text-sm text-muted-foreground">{t("没有匹配「")}{pageQuery.trim()}{t("」的项目。")}</div>
      ) : (
        <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3 overflow-y-auto">
          {shown.map((g) => (
            <RepoCard key={g.id} {...g} />
          ))}
        </div>
      )}
    </div>
  );
}
