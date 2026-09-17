/** 用户设置（localStorage 持久化）：GitHub 加速、启动后自动退出商店、默认安装目录、忽略更新。 */

import { create } from "zustand";

/** 忽略更新的取值：具体版本号 = 忽略此版本；"*" = 永久忽略 */
export type IgnoredMap = Record<string, string>;

function loadIgnored(): IgnoredMap {
  try {
    return JSON.parse(localStorage.getItem("tongtop.ignoredUpdates") ?? "{}");
  } catch {
    return {};
  }
}

interface SettingsStore {
  /** GitHub 资产链接加速前缀（"" = 直连） */
  ghProxy: string;
  setGhProxy: (v: string) => void;
  /** 启动智能体后自动退出商店（"任务结束"） */
  autoExit: boolean;
  setAutoExit: (v: boolean) => void;
  /** winget 默认安装目录（"" = winget 默认；如 D:\Apps） */
  installLocation: string;
  setInstallLocation: (v: string) => void;
  /** 被忽略的更新：winget id 小写 → 版本号 | "*" */
  ignored: IgnoredMap;
  /** 忽略此版本（该版本不再出现在更新列表；再出新版会重新提醒） */
  ignoreVersion: (id: string, version: string) => void;
  /** 永久忽略该软件的所有更新 */
  ignoreForever: (id: string) => void;
  /** 恢复（取消忽略） */
  unignore: (id: string) => void;
}

export const useSettingsStore = create<SettingsStore>()((set, get) => ({
  ghProxy: localStorage.getItem("tongtop.ghProxy") ?? "",
  setGhProxy: (v) => {
    localStorage.setItem("tongtop.ghProxy", v);
    set({ ghProxy: v });
  },
  autoExit: localStorage.getItem("tongtop.autoExit") !== "0",
  setAutoExit: (v) => {
    localStorage.setItem("tongtop.autoExit", v ? "1" : "0");
    set({ autoExit: v });
  },
  installLocation: localStorage.getItem("tongtop.installLocation") ?? "",
  setInstallLocation: (v) => {
    localStorage.setItem("tongtop.installLocation", v);
    set({ installLocation: v });
  },
  ignored: loadIgnored(),
  ignoreVersion: (id, version) => {
    const ignored = { ...get().ignored, [id.toLowerCase()]: version };
    localStorage.setItem("tongtop.ignoredUpdates", JSON.stringify(ignored));
    set({ ignored });
  },
  ignoreForever: (id) => {
    const ignored = { ...get().ignored, [id.toLowerCase()]: "*" };
    localStorage.setItem("tongtop.ignoredUpdates", JSON.stringify(ignored));
    set({ ignored });
  },
  unignore: (id) => {
    const ignored = { ...get().ignored };
    delete ignored[id.toLowerCase()];
    localStorage.setItem("tongtop.ignoredUpdates", JSON.stringify(ignored));
    set({ ignored });
  },
}));
