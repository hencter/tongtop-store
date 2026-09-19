/**
 * i18n：中文字符串即 key，仅维护英文字典（缺失回退中文原文）。
 * - 组件里用 useT()（语言切换即重渲染）；非组件上下文用 t()。
 * - 语言持久化 localStorage；默认跟随系统（zh* → 中文，其余 → English）。
 */

import { create } from "zustand";
import { EN } from "./en";

export type Locale = "zh" | "en";

/** "auto" 仅存在于 localStorage：每次启动按系统重新判定 */
function initLocale(): Locale {
  const saved = localStorage.getItem("tongtop.locale");
  if (saved === "zh" || saved === "en") return saved;
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

interface I18nStore {
  locale: Locale;
  setLocale: (l: Locale | "auto") => void;
}

export const useI18n = create<I18nStore>()((set) => ({
  locale: initLocale(),
  setLocale: (l) => {
    if (l === "auto") {
      localStorage.removeItem("tongtop.locale");
      set({ locale: navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en" });
      return;
    }
    localStorage.setItem("tongtop.locale", l);
    set({ locale: l });
  },
}));

/** 非组件上下文（store/工具函数） */
export function t(s: string): string {
  if (useI18n.getState().locale === "zh") return s;
  return EN[s] ?? s;
}

/** 组件 hook：跟随语言切换重渲染 */
export function useT() {
  const locale = useI18n((s) => s.locale);
  return (s: string): string => (locale === "zh" ? s : (EN[s] ?? s));
}
