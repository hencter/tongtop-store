/** AI 智能体：选择页（卡片墙）+ 装机页（流水线 + 配置 + 一键启动）。 */

import { useEffect, useRef } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  ExternalLink,
  Loader2,
  Play,
  Rocket,
  XCircle,
} from "lucide-react";
import { AGENTS, type AgentRecipe } from "../../catalog/agents";
import { useAgentStore, type Step } from "../../state/agentStore";
import { useSettingsStore } from "../../state/settingsStore";
import { AppIcon } from "../../components/AppIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

// ---------- 选择页 ----------

function AgentCard({ recipe, installed, onPick }: { recipe: AgentRecipe; installed: boolean; onPick: () => void }) {
  const kindLabel = recipe.desktopNames ? "桌面端" : recipe.webPort ? "Web" : "CLI";
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
          <Badge variant="outline">{kindLabel}</Badge>
          {recipe.env.length === 0 && <Badge variant="secondary">免密钥</Badge>}
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
  const close = useAgentStore((s) => s.close);
  const reset = useAgentStore((s) => s.reset);
  const autoExit = useSettingsStore((s) => s.autoExit);
  const setAutoExit = useSettingsStore((s) => s.setAutoExit);

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
            {recipe.vendor} · {recipe.install.kind === "npm" ? "npm" : recipe.install.kind === "pip" ? "pip" : "winget"} 安装
          </div>
        </div>
        <Button variant="link" className="ml-auto text-xs" onClick={() => void openUrl(recipe.homepage)}>
          官方文档 <ExternalLink className="size-3" />
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[300px_1fr] gap-4">
        {/* 左：流水线 + 配置 */}
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
          <Card className="p-4">
            <div className="mb-2.5 text-[13px] font-semibold">装机流水线</div>
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
              <div className="mb-2.5 text-[13px] font-semibold">密钥与端点</div>
              <div className="flex flex-col gap-3">
                {recipe.env.map((e) => (
                  <div key={e.name}>
                    <div className="mb-1 flex items-baseline justify-between text-xs">
                      <span>
                        {e.label}
                        {e.required && <span className="text-destructive"> *</span>}
                      </span>
                      {e.hint && <span className="text-[10px] text-muted-foreground">{e.hint}</span>}
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
                  写入用户级环境变量（启动时也会直接注入进程），不写入任何文件。
                </p>
              </div>
            </Card>
          )}

          {recipe.install.kind !== "winget" && (
            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border px-3.5 py-2.5 text-[13px]">
              使用国内镜像加速安装
              <Switch checked={useMirror} onCheckedChange={setUseMirror} disabled={running || finished} />
            </label>
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
                {running ? "装机中…" : anyFail ? "重试装机" : "开始装机"}
              </Button>
            ) : (
              <>
                <Button size="lg" className="flex-1" onClick={() => void launch()}>
                  <Play className="size-4" /> {recipe.webPort ? "启动并打开浏览器" : `启动 ${recipe.name}`}
                </Button>
                {installed && (
                  <Button variant="outline" size="lg" className="shrink-0" onClick={reset}>
                    重新装机
                  </Button>
                )}
                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground" title="启动后商店自动退出——任务结束">
                  <Switch checked={autoExit} onCheckedChange={setAutoExit} />
                  启动后退出商店
                </label>
              </>
            )}
          </div>
          {missingRequired && !finished && (
            <div className="shrink-0 text-[11px] text-destructive">请先填写带 * 的必填项</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- 入口 ----------

export function AgentsPage() {
  const agentId = useAgentStore((s) => s.agentId);
  const open = useAgentStore((s) => s.open);
  const installedMap = useAgentStore((s) => s.installedMap);
  const detectInstalled = useAgentStore((s) => s.detectInstalled);
  const recipe = AGENTS.find((a) => a.id === agentId);

  // 进入本页重新探测一次（开机探测后用户可能又装了新东西）
  useEffect(() => {
    void detectInstalled();
  }, [detectInstalled]);

  if (recipe) return <SetupPage recipe={recipe} />;

  return (
    <div className="page h-full overflow-y-auto">
      <header className="mb-1.5">
        <h2 className="m-0 text-lg font-semibold tracking-wide">AI 智能体</h2>
      </header>
      <p className="mb-4 text-xs text-muted-foreground">
        选一个智能体，剩下的交给我们：装运行时、装本体、配镜像、写密钥，全程在一个界面里完成。
        最后点「启动」—— 商店退出，任务结束。已安装的会自动识别，直接启动即可。
      </p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
        {AGENTS.map((a) => (
          <AgentCard key={a.id} recipe={a} installed={installedMap[a.id] === true} onPick={() => open(a.id)} />
        ))}
      </div>
    </div>
  );
}
