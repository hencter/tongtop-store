/** 用户设置（localStorage 持久化）：GitHub 加速、启动后自动退出商店、默认安装目录、忽略更新。 */

import { create } from "zustand";

/** 目录数据 API 默认地址（网站静态 JSON，首页推荐实时更新源） */
export const DEFAULT_CATALOG_API = "https://store.tongtianlu.cn";

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
  /** 目录数据 API（首页推荐实时更新源；"" = 仅用内置数据） */
  catalogApi: string;
  setCatalogApi: (v: string) => void;
  /** 启动智能体后自动退出商店（默认 false：窗口收进托盘常驻后台） */
  autoExit: boolean;
  setAutoExit: (v: boolean) => void;
  /** winget 默认安装目录（"" = winget 默认；如 D:\Apps） */
  installLocation: string;
  setInstallLocation: (v: string) => void;
  /** 允许镜像自动切换（默认关闭：只测速出推荐，不擅自改其他工具配置，issue #21） */
  autoSwitchMirrors: boolean;
  setAutoSwitchMirrors: (v: boolean) => void;
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
  catalogApi: localStorage.getItem("tongtop.catalogApi") ?? DEFAULT_CATALOG_API,
  setCatalogApi: (v) => {
    localStorage.setItem("tongtop.catalogApi", v);
    set({ catalogApi: v });
  },
  // 默认常驻托盘（"1" 才是退出商店；未设置过的老用户同样迁移到新默认）
  autoExit: localStorage.getItem("tongtop.autoExit") === "1",
  setAutoExit: (v) => {
    localStorage.setItem("tongtop.autoExit", v ? "1" : "0");
    set({ autoExit: v });
  },
  installLocation: localStorage.getItem("tongtop.installLocation") ?? "",
  setInstallLocation: (v) => {
    localStorage.setItem("tongtop.installLocation", v);
    set({ installLocation: v });
  },
  autoSwitchMirrors: localStorage.getItem("tongtop.autoSwitchMirrors") === "1",
  setAutoSwitchMirrors: (v) => {
    localStorage.setItem("tongtop.autoSwitchMirrors", v ? "1" : "0");
    set({ autoSwitchMirrors: v });
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
