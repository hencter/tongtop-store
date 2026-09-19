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

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {termId ? <TerminalWindow id={termId} title={termTitle} /> : <App />}
  </React.StrictMode>,
);
