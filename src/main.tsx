import React from "react";
import ReactDOM from "react-dom/client";
import { initTheme } from "./state/themeStore";
import "./styles/global.css";

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

// 两路各自动态加载：主窗口不背 xterm，终端窗口不背整个商店
const root = termId
  ? import("./components/TerminalWindow").then(({ TerminalWindow }) => <TerminalWindow id={termId} title={termTitle} />)
  : import("./App").then(({ default: App }) => <App />);

void root.then((node) => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<React.StrictMode>{node}</React.StrictMode>);
});
