/** AI 智能体：选择页（卡片墙，CLI / 桌面端分栏）+ 装机页（流水线 + 配置 + 一键启动）。 */

import { useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  ExternalLink,
  Loader2,
  Play,
  Rocket,
  ShieldAlert,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { CONCERN_CAUTION, type AgentRecipe } from "../../catalog/agents";
import { useCatalogStore } from "../../state/catalogStore";
import { useAgentStore, type Step } from "../../state/agentStore";
import { useAppStore } from "../../state/appStore";
import { useT } from "../../i18n";
import { useSettingsStore } from "../../state/settingsStore";
import { AppIcon } from "../../components/AppIcon";
import { PageTabs } from "../../components/PageTabs";
import { PageFilter } from "../../components/PageFilter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

// ---------- 选择页 ----------

function AgentCard({ recipe, installed, onPick }: { recipe: AgentRecipe; installed: boolean; onPick: () => void }) {
  const t = useT();
  const kindLabel = recipe.desktopNames ? t("桌面端") : recipe.webPort ? "Web" : "CLI";
  const requiredKeys = recipe.env.filter((e) => e.required).length;
  const keyLabel = requiredKeys > 0 ? t("需密钥") : recipe.env.length > 0 ? t("密钥可选") : t("免密钥");
  const runtimeLabel =
    recipe.runtime === "none" ? null : (recipe.runtimeLabel ?? (recipe.runtime === "node" ? "Node.js" : "Python"));
  return (
    <Card className="flex flex-col gap-2 p-4 transition-colors hover:border-foreground/20">
      <div className="flex items-center gap-3">
        <AppIcon id={`agent:${recipe.id}`} name={recipe.name} size={40} />
        <div>
          <div className="font-semibold">{recipe.name}</div>
          <div className="text-[11px] text-muted-foreground">{recipe.vendor}</div>
        </div>
        <div className="ml-auto flex flex-wrap justify-end gap-1.5">
          {installed && (
            <Badge variant="outline">
              <CheckCircle2 className="size-3 text-ok" /> 已安装
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
          <Badge variant="outline">{kindLabel}</Badge>
          {runtimeLabel && <Badge variant="outline" title={t("所需运行时（装机时自动安装）")}>{runtimeLabel}</Badge>}
          <Badge variant={requiredKeys > 0 ? "outline" : "secondary"} title={requiredKeys > 0 ? t("使用前需申请并配置厂商密钥") : undefined}>
            {keyLabel}
          </Badge>
        </div>
      </div>
      <div className="min-h-8 text-xs text-muted-foreground">{recipe.desc}</div>
      <div className="mt-auto flex gap-2 pt-1">
        <Button size="sm" className="flex-1" onClick={onPick}>
          {installed ? (
            <>
              <Play className="size-3.5" /> {t("启动")}
            </>
          ) : (
            <>
              <Rocket className="size-3.5" /> {t("查看并安装")}
            </>
          )}
        </Button>
        <Button variant="outline" size="sm" onClick={() => void openUrl(recipe.homepage)}>
          <ExternalLink className="size-3.5" />
        </Button>
      </div>
    </Card>
  );
}

// ---------- 装机页 ----------

function StepIcon({ status }: { status: Step["status"] }) {
  switch (status) {
    case "running":
      return <Loader2 className="size-4 animate-spin text-primary" />;
    case "ok":
      return <CheckCircle2 className="size-4 text-ok" />;
    case "fail":
      return <XCircle className="size-4 text-destructive" />;
    case "skipped":
      return <CheckCircle2 className="size-4 text-muted-foreground" />;
    default:
      return <Circle className="size-4 text-muted-foreground/50" />;
  }
}

function SetupPage({ recipe }: { recipe: AgentRecipe }) {
  const t = useT();
  const steps = useAgentStore((s) => s.steps);
  const running = useAgentStore((s) => s.running);
  const finished = useAgentStore((s) => s.finished);
  const log = useAgentStore((s) => s.log);
  const envValues = useAgentStore((s) => s.envValues);
  const useMirror = useAgentStore((s) => s.useMirror);
  const installed = useAgentStore((s) => s.installedMap[recipe.id] === true);
  const setEnv = useAgentStore((s) => s.setEnv);
  const setUseMirror = useAgentStore((s) => s.setUseMirror);
  const start = useAgentStore((s) => s.start);
  const launch = useAgentStore((s) => s.launch);
  const uninstall = useAgentStore((s) => s.uninstall);
  const close = useAgentStore((s) => s.close);
  const reset = useAgentStore((s) => s.reset);
  const autoExit = useSettingsStore((s) => s.autoExit);
  const setAutoExit = useSettingsStore((s) => s.setAutoExit);
  const [confirmUninstall, setConfirmUninstall] = useState(false);
  // 日志默认折叠（高级信息）；装机开始/失败时自动展开（issue #19：进度与失败原因优先于原始日志）
  const [showLog, setShowLog] = useState(false);
  useEffect(() => {
    if (running || steps.some((s) => s.status === "fail")) setShowLog(true);
  }, [running, steps]);

  const logRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length]);

  const missingRequired = recipe.env.some((e) => e.required && !envValues[e.name]?.trim());
  const anyFail = steps.some((s) => s.status === "fail");

  return (
    <div className="page flex h-full flex-col">
      <header className="mb-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="size-8" onClick={close}>
          <ArrowLeft className="size-4" />
        </Button>
        <AppIcon id={`agent:${recipe.id}`} name={recipe.name} size={40} />
        <div className="min-w-0">
          <div className="font-semibold">{recipe.name}</div>
          <div className="text-[11px] text-muted-foreground">
            {recipe.vendor} · {recipe.install.kind === "npm" ? "npm" : recipe.install.kind === "pip" ? "pip" : "winget"} {t("安装")}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">{recipe.desc}</div>
        </div>
        <Button variant="link" className="ml-auto text-xs" onClick={() => void openUrl(recipe.homepage)}>
          {t("官方文档")} <ExternalLink className="size-3" />
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[300px_1fr] gap-4">
        {/* 左：安装前检查 + 流水线 + 配置 */}
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
          {/* 安装前检查：运行形式、必要条件、将修改的配置、数据风险（issue #19） */}
          <Card className="p-4">
            <div className="mb-2.5 text-[13px] font-semibold">{t("安装前检查")}</div>
            <ul className="m-0 flex flex-col gap-1.5 pl-0 text-[12px] leading-relaxed text-muted-foreground">
              <li>
                {t("运行形式：")}
                {recipe.desktopNames ? t("桌面应用（图形界面）") : recipe.webPort ? t("本地 Web 服务（启动后自动打开浏览器）") : t("命令行工具（在商店内嵌终端运行）")}
              </li>
              <li>
                {t("运行时：")}
                {recipe.runtime === "none"
                  ? t("无额外依赖")
                  : `${recipe.runtimeLabel ?? (recipe.runtime === "node" ? "Node.js" : "Python")}${t("（未安装将经 winget 自动安装）")}`}
              </li>
              <li>
                {t("账号 / 密钥：")}
                {recipe.env.filter((e) => e.required).length > 0
                  ? t("需配置 ") + recipe.env.filter((e) => e.required).length + t(" 项必填密钥（下方获取并填写后才能开始）")
                  : recipe.env.length > 0
                    ? t("密钥可选，不填也能安装")
                    : t("无需账号或密钥")}
              </li>
              {(recipe.env.length > 0 || recipe.pathExtra.length > 0) && (
                <li>
                  {t("将修改的配置：")}
                  {recipe.env.length > 0 &&
                    t("用户级环境变量（") + recipe.env.map((e) => e.name).join("、") + t("），持久保留")}
                  {recipe.env.length > 0 && recipe.pathExtra.length > 0 && "；"}
                  {recipe.pathExtra.length > 0 && t("用户 PATH 追加目录")}
                </li>
              )}
              {recipe.concerns && recipe.concerns.length > 0 && (
                <li className="text-gold">
                  {t("数据风险：")}{recipe.concerns.map((c) => CONCERN_CAUTION[c]).join("；")}
                </li>
              )}
            </ul>
          </Card>

          <Card className="p-4">
            <div className="mb-2.5 text-[13px] font-semibold">{t("装机流水线")}</div>
            <div className="flex flex-col gap-2">
              {steps.map((s) => (
                <div key={s.id} className="flex items-start gap-2.5 text-[13px]">
                  <span className="mt-0.5"><StepIcon status={s.status} /></span>
                  <div className="min-w-0">
                    <div className={s.status === "pending" ? "text-muted-foreground" : ""}>{s.label}</div>
                    {s.detail && <div className="truncate text-[11px] text-muted-foreground">{s.detail}</div>}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {recipe.env.length > 0 && (
            <Card className="p-4">
              <div className="mb-2.5 text-[13px] font-semibold">{t("密钥与端点")}</div>
              <div className="flex flex-col gap-3">
                {recipe.env.map((e) => (
                  <div key={e.name}>
                    <div className="mb-1 flex items-baseline justify-between text-xs">
                      <span>
                        {e.label}
                        {e.required && <span className="text-destructive"> *</span>}
                      </span>
                      {e.url ? (
                        <button
                          className="flex items-center gap-0.5 text-[10px] text-primary hover:underline"
                          onClick={() => void openUrl(e.url!)}
                          title={t("前往申请：") + e.url}
                        >
                          {e.hint ?? t("获取 Key")} <ExternalLink className="size-2.5" />
                        </button>
                      ) : (
                        e.hint && <span className="text-[10px] text-muted-foreground">{e.hint}</span>
                      )}
                    </div>
                    <Input
                      type={e.secret ? "password" : "text"}
                      placeholder={e.placeholder}
                      value={envValues[e.name] ?? ""}
                      disabled={running || finished}
                      onChange={(ev) => setEnv(e.name, ev.target.value)}
                    />
                  </div>
                ))}
                <p className="m-0 text-[11px] leading-relaxed text-muted-foreground">
                  {t("密钥以用户级环境变量持久保存（重启后仍有效），启动时也直接注入进程。")}
                  {t("卸载本体不会删除这些变量；如需清除：Windows 设置 → 搜索「编辑账户的环境变量」手动删除。")}
                </p>
              </div>
            </Card>
          )}

          {recipe.install.kind !== "winget" && (
            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border px-3.5 py-2.5 text-[13px]">
              {t("使用国内镜像加速安装")}
              <Switch checked={useMirror} onCheckedChange={setUseMirror} disabled={running || finished} />
            </label>
          )}

          {recipe.concerns && recipe.concerns.length > 0 && (
            <div className="m-0 flex items-start gap-2 rounded-lg border border-gold/40 bg-gold/5 px-3.5 py-2.5 text-[11px] leading-relaxed text-gold">
              <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
              <div>
                {t("涉及企业开发/涉密项目请勿安装（数据安全）：")}
                {recipe.concerns.map((c) => (
                  <div key={c}>· {CONCERN_CAUTION[c]}</div>
                ))}
              </div>
            </div>
          )}

          {recipe.notes?.map((n) => (
            <p key={n} className="m-0 rounded-lg border border-border bg-muted/40 px-3.5 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
              {n}
            </p>
          ))}
        </div>

        {/* 右：状态摘要 + 操作 + 可展开日志 */}
        <div className="flex min-h-0 flex-col gap-3">
          {/* 状态摘要：进度、失败原因与下一步优先于原始日志 */}
          <Card className="shrink-0 p-4">
            {finished ? (
              <div className="flex items-center gap-2 text-[13px] text-ok">
                <CheckCircle2 className="size-4" /> {t("装机完成，可以启动了。")}
              </div>
            ) : anyFail ? (
              <div className="text-[13px]">
                <div className="flex items-center gap-2 text-destructive">
                  <XCircle className="size-4" /> {t("有步骤失败：")}
                  {steps.find((s) => s.status === "fail")?.label}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {steps.find((s) => s.status === "fail")?.detail ?? t("详见下方日志；修正后点「重试装机」。")}
                </div>
              </div>
            ) : running ? (
              <div className="flex items-center gap-2 text-[13px]">
                <Loader2 className="size-4 animate-spin text-primary" />
                {steps.find((s) => s.status === "running")?.label ?? t("装机中…")}
              </div>
            ) : (
              <div className="text-[13px] text-muted-foreground">
                {missingRequired
                  ? t("请先完成下方必填密钥（带 *），再开始装机。")
                  : t("检查就绪。点「开始装机」依次执行左侧流水线。")}
              </div>
            )}
          </Card>

          <button
            className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowLog((v) => !v)}
            aria-expanded={showLog}
          >
            {showLog ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            {t("原始日志（高级）")}
          </button>
          {showLog && (
            <pre
              ref={logRef}
              className="min-h-0 flex-1 select-text overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-muted p-4 font-mono text-xs leading-relaxed text-muted-foreground"
            >
              {log.length > 0 ? log.join("\n") : t("暂无日志。")}
            </pre>
          )}
          <div className="flex shrink-0 items-center gap-3">
            {!finished ? (
              <Button size="lg" className="flex-1" disabled={running || missingRequired} onClick={() => void start()}>
                {running ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
                {running ? t("装机中…") : anyFail ? t("重试装机") : t("开始装机")}
              </Button>
            ) : (
              <>
                <Button size="lg" className="flex-1" onClick={() => void launch()}>
                  <Play className="size-4" /> {recipe.webPort ? t("启动并打开浏览器") : `${t("启动 ")}${recipe.name}`}
                </Button>
                {installed && !confirmUninstall && (
                  <>
                    <Button variant="outline" size="lg" className="shrink-0" onClick={reset}>
                      {t("重新装机")}
                    </Button>
                    <Button
                      variant="outline"
                      size="lg"
                      className="shrink-0 text-destructive hover:text-destructive"
                      disabled={running}
                      title={t("卸载本体（保留已写入的密钥环境变量）")}
                      onClick={() => setConfirmUninstall(true)}
                    >
                      <Trash2 className="size-4" /> {t("卸载")}
                    </Button>
                  </>
                )}
                {confirmUninstall && (
                  <>
                    <Button
                      variant="destructive"
                      size="lg"
                      className="shrink-0"
                      disabled={running}
                      onClick={() => {
                        setConfirmUninstall(false);
                        void uninstall();
                      }}
                    >
                      {running ? <Loader2 className="size-4 animate-spin" /> : t("确认卸载")}
                    </Button>
                    <Button variant="ghost" size="icon" className="size-10 shrink-0" onClick={() => setConfirmUninstall(false)} title="取消">
                      <X className="size-4" />
                    </Button>
                  </>
                )}
                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground" title="仅对桌面端智能体生效：开启则启动后真正退出商店。CLI 智能体在内嵌终端运行，商店始终常驻托盘">
                  <Switch checked={autoExit} onCheckedChange={setAutoExit} />
                  {t("启动后退出商店")}
                </label>
              </>
            )}
          </div>
          {missingRequired && !finished && (
            <div className="shrink-0 text-[11px] text-destructive">{t("请先填写带 * 的必填项")}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- 入口 ----------

/** 分栏：desktopNames → 桌面端（GUI）；webPort → Web（本地服务）；其余 CLI */
type AgentTab = "desktop" | "cli" | "web";
const kindOf = (a: AgentRecipe): AgentTab =>
  a.desktopNames ? "desktop" : a.webPort ? "web" : "cli";

export function AgentsPage() {
  const t = useT();
  const agentId = useAgentStore((s) => s.agentId);
  const open = useAgentStore((s) => s.open);
  const installedMap = useAgentStore((s) => s.installedMap);
  const detectInstalled = useAgentStore((s) => s.detectInstalled);
  const pageQuery = useAppStore((s) => s.pageQueries.agents ?? "");
  const tab = useAppStore((s) => s.tab);
  const agents = useCatalogStore((s) => s.agents);
  const recipe = agents.find((a) => a.id === agentId);
  const [kind, setKind] = useState<AgentTab>("desktop");

  // 每次切回本页都重新探测（keep-alive 下 useEffect 只在首次挂载跑，故监听 tab）
  useEffect(() => {
    if (tab === "agents") void detectInstalled();
  }, [tab, detectInstalled]);

  if (recipe) return <SetupPage recipe={recipe} />;

  // 标题栏搜索（本页作用域）：过滤名称 / 厂商 / 简介
  const q = pageQuery.trim().toLowerCase();
  const searched = q
    ? agents.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.vendor.toLowerCase().includes(q) ||
          a.desc.toLowerCase().includes(q),
      )
    : agents;
  // 搜索时跨分栏展示全部命中；否则按当前分栏过滤
  const shown = q ? searched : searched.filter((a) => kindOf(a) === kind);
  const countOf = (k: AgentTab) => agents.filter((a) => kindOf(a) === k).length;

  return (
    <div className="page h-full overflow-y-auto">
      <header className="mb-1.5 flex items-center justify-between">
        <h2 className="m-0 text-lg font-semibold tracking-wide">AI 智能体</h2>
        <div className="flex items-center gap-3">
          <PageFilter tab="agents" placeholder="筛选本页智能体…" />
          <PageTabs
            tabs={[
              { id: "desktop" as const, label: t("桌面端"), count: countOf("desktop") },
              { id: "cli" as const, label: t("CLI 端"), count: countOf("cli") },
              { id: "web" as const, label: "Web", count: countOf("web") },
            ]}
            active={kind}
            onChange={setKind}
          />
        </div>
      </header>
      <p className="mb-4 text-xs text-muted-foreground">
        {t("桌面端 = 图形界面应用；CLI = 命令行工具（在商店内嵌终端运行）；Web = 本地服务，启动后浏览器打开。")}
        {t("点「查看并安装」进入详情：先看安装前检查（运行时、密钥、将修改的配置），再开始装机。")}
      </p>
      {shown.length === 0 ? (
        <div className="py-14 text-center text-sm text-muted-foreground">{t("没有匹配「")}{pageQuery.trim()}{t("」的智能体。")}</div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
          {shown.map((a) => (
            <AgentCard key={a.id} recipe={a} installed={installedMap[a.id] === true} onPick={() => open(a.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
