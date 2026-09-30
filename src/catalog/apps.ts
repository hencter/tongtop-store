/**
 * 精选目录（静态数据，首屏零 IPC 直接渲染）。
 *
 * 定位纪律：本商店**不托管任何安装包**，这里只保存官方分发信息：
 * 默认安装走 winget 官方源；少数尚未进入 winget 的软件可声明厂商官方直链，
 * 由宿主下载后启动原始安装器。
 * 数据本体在 /data/apps.json（与 Astro 网站共用一份数据源）。
 */

import catalog from "../../data/apps.json";
import categories from "../../data/categories.json";

export type CategoryId =
  | "ai"
  | "browser"
  | "social"
  | "office"
  | "dev"
  | "media"
  | "game"
  | "system"
  | "netdisk";

export interface CatalogApp {
  /** 目录稳定 ID；默认同时作为 winget 包 ID */
  id: string;
  /** 显示名 */
  name: string;
  /** 一句话简介 */
  desc: string;
  /** 官方网站 */
  site: string;
  category: CategoryId;
  tags?: string[];
  /** 官方 GitHub 发布仓库（owner/repo）——有它就在详情里分发 Releases 直链 */
  github?: string;
  /** 具备 AI 功能（用于「AI 应用」分类聚合） */
  ai?: boolean;
  /** 厂商官方发布/下载渠道（UI 显示“官方”） */
  official?: boolean;
  /** 厂商官方安装包直链；存在时安装走宿主 download 任务而不是 winget */
  download?: {
    url: string;
    /** 安装器参数；为空时按厂商安装器默认交互运行 */
    args?: string[];
    /** 展示用平台标签，例如 Windows x64 */
    platform?: string;
  };
}

export const CATEGORIES: { id: CategoryId; label: string }[] = categories as {
  id: CategoryId;
  label: string;
}[];

export const CATALOG: CatalogApp[] = catalog as CatalogApp[];

export const CATALOG_BY_ID: ReadonlyMap<string, CatalogApp> = new Map(
  CATALOG.map((a) => [a.id.toLowerCase(), a]),
);
