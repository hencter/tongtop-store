/** 自绘标题栏（窗口 decorations:false，这是唯一的标题栏）。
 *  三段布局：左侧标识 / 中央**全局搜索**（始终查全店软件，输入即进搜索页，
 *  输入与回车作用域一致；各页列表过滤由页内筛选框承担，issue #16）/ 右侧主题 + 窗口按钮。
 *  整条是拖动区（data-tauri-drag-region 自动跳过按钮与输入框），双击即最大化/还原。
 *  浏览器预览（无窗口 API）时窗口按钮整组不出现。
 */

import { getCurrentWindow } from "@tauri-apps/api/window";
import { Loader2, Minus, Search, Square, X } from "lucide-react";
import { useAppStore } from "../state/appStore";
import { useT } from "../i18n";
import { AppLogo } from "./AppLogo";
import { ThemeToggle } from "./ThemeToggle";

const isTauri = () => "__TAURI_INTERNALS__" in window;

/** 中央搜索：全局作用域（winget 全量）。输入即切到搜索页实时出结果，
 *  不存在「输入时过滤本页、回车却跳全局」的作用域跳变。 */
function TitleSearch() {
  const t = useT();
  const tab = useAppStore((s) => s.tab);
  const setTab = useAppStore((s) => s.setTab);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const runSearch = useAppStore((s) => s.runSearch);
  const searching = useAppStore((s) => s.searching);

  return (
    <div className="flex h-7 w-full max-w-[460px] items-center gap-2 rounded-md border border-input bg-background px-2.5 text-muted-foreground transition-shadow focus-within:ring-2 focus-within:ring-ring/40">
      <Search className="size-3.5 shrink-0" />
      <input
        className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
        placeholder={t("全局搜索软件（winget 官方源）…")}
        value={searchQuery}
        onChange={(e) => {
          const v = e.target.value;
          setSearchQuery(v);
          // 输入即进全局搜索结果页：作用域从第一个字符起就是全局
          if (v.trim() && tab !== "search") setTab("search");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (searchQuery.trim() && tab !== "search") setTab("search");
            void runSearch();
          }
          if (e.key === "Escape") setSearchQuery("");
        }}
      />
      {searching ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin" />
      ) : searchQuery ? (
        <button className="shrink-0 rounded-full p-0.5 hover:bg-accent" onClick={() => setSearchQuery("")} title={t("清空（Esc）")}>
          <X className="size-3" />
        </button>
      ) : null}
    </div>
  );
}

export function Titlebar() {
  const t = useT();
  const win = isTauri() ? getCurrentWindow() : null;

  return (
    <header
      data-tauri-drag-region
      className="flex h-10 shrink-0 select-none items-center border-b border-border bg-background"
    >
      <div data-tauri-drag-region className="flex shrink-0 items-center gap-2.5 pl-3">
        <AppLogo className="size-6 shrink-0 rounded-md" />
        <span className="text-[13px] font-semibold tracking-wide">{t("应用商店")}</span>
      </div>

      <div data-tauri-drag-region className="flex min-w-0 flex-1 justify-center px-6">
        <TitleSearch />
      </div>

      <div className="flex h-full shrink-0 items-center pr-0">
        <ThemeToggle />
        {win && (
          <>
            <button
              className="grid h-full w-11 place-items-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => void win.minimize()}
              title={t("最小化")}
            >
              <Minus className="size-4" />
            </button>
            <button
              className="grid h-full w-11 place-items-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => void win.toggleMaximize()}
              title={t("最大化 / 还原")}
            >
              <Square className="size-3.5" />
            </button>
            <button
              className="grid h-full w-11 place-items-center text-muted-foreground transition-colors hover:bg-destructive hover:text-white"
              onClick={() => void win.close()}
              title={t("关闭")}
            >
              <X className="size-4" />
            </button>
          </>
        )}
      </div>
    </header>
  );
}
