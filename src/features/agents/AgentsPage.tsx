/** AI 智能体：选择页（卡片墙，CLI / 桌面端分栏）+ 装机页（流水线 + 配置 + 一键启动）。 */

import { useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowLeft,
  CheckCircle2,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

// ---------- 选择页 ----------

function AgentCard({ recipe, installed, onPick }: { recipe: AgentRecipe; installed: boolean; onPick: () => void }) {
  const t = useT();
  const kindLabel = recipe.desktopNames ? t("桌面端") : recipe.webPort ? "Web" : "CLI";
  return (
    <Card className="flex flex-col gap-2 p-4 transition-colors hover:border-foreground/20">
      <div className="flex items-center gap-3">
        <AppIcon id={`agent:${recipe.id}`} name={recipe.name} size={40} />
        <div>
          <div className="font-semibold">{recipe.name}</div>
          <div className="text-[11px] text-muted-foreground">{recipe.vendor}</div>
        </div>
        <div className="ml-auto flex gap-1.5">
          {installed && (
            <Badge variant="outline">
              <CheckCircle2 className="size-3 text-ok" /> 已安装
            </Badge>
          )}
          {recipe.concerns && (
            <Badge
              variant="outline"
              className="border-gold/40 text-gold"
              title={recipe.concerns.map((c) => CONCERN_CAUTION[c]).join("\n")}
            >
              <ShieldAlert className="size-3" /> 风险提示
            </Badge>
          )}
          <Badge variant="outline">{kindLabel}</Badge>
          {recipe.env.length === 0 && <Badge variant="secondary">{t("免密钥")}</Badge>}
        </div>
      </div>
      <div className="min-h-8 text-xs text-muted-foreground">{recipe.desc}</div>
      <div className="mt-auto flex gap-2 pt-1">
        <Button size="sm" className="flex-1" onClick={onPick}>
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
        <div>
          <div className="font-semibold">{recipe.name}</div>
          <div className="text-[11px] text-muted-foreground">
            {recipe.vendor} · {recipe.install.kind === "npm" ? "npm" : recipe.install.kind === "pip" ? "pip" : "winget"} {t("安装")}
          </div>
        </div>
        <Button variant="link" className="ml-auto text-xs" onClick={() => void openUrl(recipe.homepage)}>
          {t("官方文档")} <ExternalLink className="size-3" />
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[300px_1fr] gap-4">
        {/* 左：流水线 + 配置 */}
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
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
                  {t("写入用户级环境变量（启动时也会直接注入进程），不写入任何文件。")}
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

        {/* 右：日志 + 操作 */}
        <div className="flex min-h-0 flex-col gap-3">
          <pre
            ref={logRef}
            className="min-h-0 flex-1 select-text overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-muted p-4 font-mono text-xs leading-relaxed text-muted-foreground"
          >
            {log.length > 0 ? log.join("\n") : "准备就绪。配置好后点击下方「开始装机」。"}
          </pre>
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

/** 分栏：desktopNames → 桌面端（GUI）；其余（含 Web 型）都算 CLI 端 */
type AgentTab = "cli" | "desktop";
const kindOf = (a: AgentRecipe): AgentTab => (a.desktopNames ? "desktop" : "cli");

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
  const cliCount = agents.filter((a) => kindOf(a) === "cli").length;
  const desktopCount = agents.length - cliCount;

  return (
    <div className="page h-full overflow-y-auto">
      <header className="mb-1.5 flex items-center justify-between">
        <h2 className="m-0 text-lg font-semibold tracking-wide">AI 智能体</h2>
        <PageTabs
          tabs={[
            { id: "desktop" as const, label: t("桌面端"), count: desktopCount },
            { id: "cli" as const, label: t("CLI 端"), count: cliCount },
          ]}
          active={kind}
          onChange={setKind}
        />
      </header>
      <p className="mb-4 text-xs text-muted-foreground">
        {t("选一个智能体，剩下的交给我们：装运行时、装本体、配镜像、写密钥，全程在一个界面里完成。")}
        {t("最后点「启动」—— 商店退出，任务结束。已安装的会自动识别，直接启动即可。")}
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
