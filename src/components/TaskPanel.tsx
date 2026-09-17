/** 任务面板：进度条 + 队列芯片 + 实时日志（宿主已按时间窗合并事件）。 */

import { useEffect, useRef } from "react";
import { CheckCircle2, Loader2, X, XCircle } from "lucide-react";
import { useTaskStore } from "../state/taskStore";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export function TaskPanel() {
  const running = useTaskStore((s) => s.running);
  const queue = useTaskStore((s) => s.queue);
  const progress = useTaskStore((s) => s.progress);
  const done = useTaskStore((s) => s.done);
  const lines = useTaskStore((s) => s.lines);
  const panelOpen = useTaskStore((s) => s.panelOpen);
  const silent = useTaskStore((s) => s.silent);
  const setSilent = useTaskStore((s) => s.setSilent);
  const cancel = useTaskStore((s) => s.cancel);
  const closePanel = useTaskStore((s) => s.closePanel);
  const openPanel = useTaskStore((s) => s.openPanel);

  const logRef = useRef<HTMLPreElement>(null);
  // 用户上翻查看时不强制回底；回到底部附近才恢复跟随
  const stickBottom = useRef(true);

  // 新任务开始：日志清空，重新跟随滚动
  const runningId = running?.id ?? null;
  useEffect(() => {
    stickBottom.current = true;
  }, [runningId]);

  useEffect(() => {
    const el = logRef.current;
    if (el && stickBottom.current) el.scrollTop = el.scrollHeight;
  }, [lines.length, done]);

  const active = running ?? done;
  if (!active && queue.length === 0) return null;

  if (!panelOpen) {
    if (!running && queue.length === 0) return null;
    return (
      <button
        className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-full border border-border bg-popover px-4 py-2.5 text-[13px] shadow-lg"
        onClick={openPanel}
      >
        <Loader2 className="size-3.5 animate-spin text-primary" />
        {running ? running.label : `队列中（${queue.length}）`}…
        {progress !== null && <span className="text-xs text-muted-foreground">{progress}%</span>}
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-5 right-5 z-[60] flex h-[340px] w-[580px] max-w-[calc(100vw-40px)] flex-col overflow-hidden rounded-lg border border-border bg-popover shadow-xl"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2 text-[13px] font-semibold">
          {running && <Loader2 className="size-4 shrink-0 animate-spin text-primary" />}
          {!running && done &&
            (done.success ? (
              <CheckCircle2 className="size-4 shrink-0 text-ok" />
            ) : (
              <XCircle className="size-4 shrink-0 text-destructive" />
            ))}
          <span className="truncate">
            {running ? running.label : done ? (done.success ? `完成：${done.id}` : `失败：${done.id}（${done.code}）`) : "队列等待中"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground" title="静默模式：-h，不弹安装向导">
            <Switch checked={silent} onCheckedChange={setSilent} />
            静默
          </label>
          {running && (
            <Button variant="outline" size="sm" onClick={() => void cancel(running.id)}>
              取消
            </Button>
          )}
          <Button variant="ghost" size="icon" className="size-7" onClick={closePanel} title={running ? "收起（任务继续）" : "关闭"}>
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* 进度条：winget 下载输出里解析出的百分比 */}
      {running && (
        <div className="border-b border-border px-4 py-2">
          <div className="flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full bg-primary transition-all duration-300 ${
                  progress === null ? "w-1/3 animate-pulse" : ""
                }`}
                style={progress !== null ? { width: `${progress}%` } : undefined}
              />
            </div>
            <span className="w-10 shrink-0 text-right text-[11px] text-muted-foreground">
              {progress !== null ? `${progress}%` : "…"}
            </span>
          </div>
        </div>
      )}

      {/* 队列芯片：winget 有官方安装锁，任务排队依次执行 */}
      {queue.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-4 py-2">
          <span className="text-[11px] text-muted-foreground">排队：</span>
          {queue.map((q) => (
            <span
              key={q.id}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px]"
              title={q.id}
            >
              <span className="max-w-40 truncate">{q.label}</span>
              <button
                className="rounded-full p-0.5 hover:bg-accent"
                onClick={() => void cancel(q.id)}
                title="移出队列"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {running && (
        <div className="truncate border-b border-border px-4 py-1.5 font-mono text-[11px] text-muted-foreground">
          $ {running.command}
        </div>
      )}
      <pre
        ref={logRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        className="flex-1 select-text overflow-y-auto whitespace-pre-wrap break-all p-4 font-mono text-xs leading-relaxed text-muted-foreground"
      >
        {lines.join("\n")}
        {done && !running && !done.success && done.errorTail.length > 0
          ? `\n—— stderr ——\n${done.errorTail.join("\n")}`
          : ""}
      </pre>
    </div>
  );
}
