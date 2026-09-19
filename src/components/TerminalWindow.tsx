/** 内嵌终端窗口：xterm.js（WebGL GPU 渲染）+ 品牌定制标题栏。
 *  挂载时先补回滚缓冲（覆盖挂载前输出），再接实时事件流；关窗即杀进程。 */

import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { Minus, Square, X } from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import * as ipc from "../ipc/client";
import { AppLogo } from "./AppLogo";
import { useT } from "../i18n";
import "@xterm/xterm/css/xterm.css";

/** 无边框窗口的品牌标题栏（拖动区 + 状态灯 + 窗口按钮） */
function TermTitlebar({ title, exitCode }: { title: string; exitCode: number | null }) {
  const t = useT();
  const win = getCurrentWindow();
  return (
    <header
      data-tauri-drag-region
      className="flex h-9 shrink-0 select-none items-center gap-2.5 border-b border-white/10 bg-[#0c0c0c] pl-3"
    >
      <AppLogo className="size-4 rounded-sm" />
      <span data-tauri-drag-region className="text-xs font-medium text-white/80">
        {title}
      </span>
      <span className="ml-1 flex items-center gap-1.5 text-[10px] text-white/40">
        <span className={`size-1.5 rounded-full ${exitCode === null ? "animate-pulse bg-emerald-400" : "bg-white/30"}`} />
        {exitCode === null ? t("运行中") : `${t("已退出 ")}${exitCode}`}
      </span>
      <div className="ml-auto flex h-full">
        <button
          className="grid h-full w-10 place-items-center text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          onClick={() => void win.minimize()}
          title={t("最小化")}
        >
          <Minus className="size-3.5" />
        </button>
        <button
          className="grid h-full w-10 place-items-center text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          onClick={() => void win.toggleMaximize()}
          title={t("最大化 / 还原")}
        >
          <Square className="size-3" />
        </button>
        <button
          className="grid h-full w-10 place-items-center text-white/50 transition-colors hover:bg-destructive hover:text-white"
          onClick={() => void win.close()}
          title={t("关闭（结束进程）")}
        >
          <X className="size-4" />
        </button>
      </div>
    </header>
  );
}

export function TerminalWindow({ id, title }: { id: string; title: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);

  useEffect(() => {
    document.title = title;
    // 终端窗口固定深色（不受系统主题影响，加载瞬间也不闪白）
    document.body.style.background = "#0c0c0c";
    const term = new Terminal({
      fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
      fontSize: 13,
      cursorBlink: true,
      scrollback: 5000,
      theme: {
        background: "#0c0c0c",
        foreground: "#e5e5e5",
        cursor: "#B8792C",
        selectionBackground: "#B8792C55",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current!);
    // WebGL GPU 渲染（VS Code 同款加速）；环境不支持时静默回退 canvas
    try {
      term.loadAddon(new WebglAddon());
    } catch {
      /* 回退默认渲染器 */
    }
    fit.fit();

    // 补发挂载前输出（spawn 到窗口就绪之间的），再接实时流
    void ipc.termBacklog(id).then((b) => {
      if (b) term.write(b);
    });
    const unData = listen<string>(`term-data-${id}`, (e) => term.write(e.payload));
    const unExit = listen<number>(`term-exit-${id}`, (e) => {
      setExitCode(e.payload);
      term.write(`\r\n\x1b[90m[进程已退出，代码 ${e.payload}]\x1b[0m\r\n`);
    });

    term.onData((d) => void ipc.termWrite(id, d));
    term.onResize(({ cols, rows }) => void ipc.termResize(id, cols, rows));
    const onWinResize = () => fit.fit();
    window.addEventListener("resize", onWinResize);

    // 关窗 = 杀进程（会话随 EOF 自动清理）
    const unClose = getCurrentWindow().onCloseRequested(() => void ipc.termKill(id));

    return () => {
      window.removeEventListener("resize", onWinResize);
      void unClose.then((f) => f());
      void unData.then((f) => f());
      void unExit.then((f) => f());
      void ipc.termKill(id);
      term.dispose();
    };
  }, [id, title]);

  return (
    <div className="flex h-full flex-col bg-[#0c0c0c]">
      <TermTitlebar title={title} exitCode={exitCode} />
      <div ref={hostRef} className="min-h-0 flex-1 p-1.5" />
    </div>
  );
}
