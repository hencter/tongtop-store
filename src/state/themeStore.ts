/** 主题：dark / light / system，class 策略（.dark 挂在 <html> 上），localStorage 持久化。 */

import { create } from "zustand";

export type Theme = "dark" | "light" | "system";

const KEY = "tongtop.theme";

function resolved(t: Theme): "dark" | "light" {
  if (t !== "system") return t;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(t: Theme) {
  document.documentElement.classList.toggle("dark", resolved(t) === "dark");
}

// 跟随系统主题变化（仅在 system 档时起作用）
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  const { theme } = useThemeStore.getState();
  if (theme === "system") apply("system");
});

interface ThemeStore {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

export const useThemeStore = create<ThemeStore>()((set) => ({
  theme: (localStorage.getItem(KEY) as Theme) || "system",
  setTheme: (t) => {
    localStorage.setItem(KEY, t);
    apply(t);
    set({ theme: t });
  },
}));

/** 首次渲染前调用，避免主题闪烁 */
export function initTheme() {
  apply(useThemeStore.getState().theme);
}
