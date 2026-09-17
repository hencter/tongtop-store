/** 自绘标题栏（窗口 decorations:false，这是唯一的标题栏）。
 *  三段布局：左侧标识 / 中央全局搜索（聚焦即跳搜索页，输入即搜，结果在主区域渲染）/ 右侧窗口按钮。
 *  整条是拖动区（data-tauri-drag-region 自动跳过按钮与输入框），双击即最大化/还原。
 *  浏览器预览（无窗口 API）时窗口按钮整组不出现。
 */

import { getCurrentWindow } from "@tauri-apps/api/window";
import { Loader2, Minus, Search, Square, X } from "lucide-react";
import { useAppStore } from "../state/appStore";
import { AppLogo } from "./AppLogo";
import { ThemeToggle } from "./ThemeToggle";

const isTauri = () => "__TAURI_INTERNALS__" in window;

export function Titlebar() {
  const win = isTauri() ? getCurrentWindow() : null;
  const query = useAppStore((s) => s.searchQuery);
  const setQuery = useAppStore((s) => s.setSearchQuery);
  const runSearch = useAppStore((s) => s.runSearch);
  const searching = useAppStore((s) => s.searching);
  const setTab = useAppStore((s) => s.setTab);

  return (
    <header
      data-tauri-drag-region
      className="flex h-10 shrink-0 select-none items-center border-b border-border bg-background"
    >
      <div data-tauri-drag-region className="flex shrink-0 items-center gap-2.5 pl-3">
        <span className="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground">
          <AppLogo className="size-3.5" />
        </span>
        <span className="text-[13px] font-semibold tracking-wide">应用商店</span>
      </div>

      {/* 中央搜索：拖到虚线区域的输入框，点击直达搜索页 */}
      <div data-tauri-drag-region className="flex min-w-0 flex-1 justify-center px-6">
        <div className="flex h-7 w-full max-w-[460px] items-center gap-2 rounded-md border border-input bg-background px-2.5 text-muted-foreground transition-shadow focus-within:ring-2 focus-within:ring-ring/40">
          <Search className="size-3.5 shrink-0" />
          <input
            className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
            placeholder="搜索软件…"
            value={query}
            onFocus={() => setTab("search")}
            onChange={(e) => {
              setTab("search");
              setQuery(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch();
            }}
          />
          {searching && <Loader2 className="size-3.5 shrink-0 animate-spin" />}
        </div>
      </div>

      <div className="flex h-full shrink-0 items-center pr-0">
        <ThemeToggle />
        {win && (
          <>
            <button
              className="grid h-full w-11 place-items-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => void win.minimize()}
              title="最小化"
            >
              <Minus className="size-4" />
            </button>
            <button
              className="grid h-full w-11 place-items-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => void win.toggleMaximize()}
              title="最大化 / 还原"
            >
              <Square className="size-3.5" />
            </button>
            <button
              className="grid h-full w-11 place-items-center text-muted-foreground transition-colors hover:bg-destructive hover:text-white"
              onClick={() => void win.close()}
              title="关闭（最小化到托盘）"
            >
              <X className="size-4" />
            </button>
          </>
        )}
      </div>
    </header>
  );
}
