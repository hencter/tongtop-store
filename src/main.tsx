import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { TerminalWindow } from "./components/TerminalWindow";
import { initTheme } from "./state/themeStore";

// 渲染前应用主题，避免闪烁
initTheme();

// 同一 index.html 双路由：?term=<id> → 内嵌终端窗口；否则主应用
const params = new URLSearchParams(window.location.search);
const termId = params.get("term");
const termTitle = params.get("title") ?? "终端";

// 主应用按桌面应用对待：禁用 webview 默认右键菜单（终端窗口保留，复制粘贴要用）
if (!termId) {
  document.addEventListener("contextmenu", (e) => e.preventDefault());
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {termId ? <TerminalWindow id={termId} title={termTitle} /> : <App />}
  </React.StrictMode>,
);
