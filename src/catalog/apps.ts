/**
 * 精选目录（静态数据，首屏零 IPC 直接渲染）。
 *
 * 定位纪律：本商店**不托管任何安装包**，这里只保存
 * 「winget ID → 官网链接」的分发信息；安装走 winget 官方源，
 * 「官网」按钮直接打开软件官方页面。
 *
 * 所有 ID 均已通过 `winget search --id <id> -e` 逐一验证（winget v1.29）。
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
  /** winget 包 ID */
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
}

export const CATEGORIES: { id: CategoryId; label: string }[] = categories as {
  id: CategoryId;
  label: string;
}[];

export const CATALOG: CatalogApp[] = catalog as CatalogApp[];

export const CATALOG_BY_ID: ReadonlyMap<string, CatalogApp> = new Map(
  CATALOG.map((a) => [a.id.toLowerCase(), a]),
);
