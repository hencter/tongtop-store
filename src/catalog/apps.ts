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

export type Pricing = "free" | "freemium" | "paid";

/** 定价枚举对应的中文文案（i18n key） */
export const PRICING_LABEL: Record<Pricing, string> = {
  free: "免费",
  freemium: "免费增值",
  paid: "付费",
};

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
  /** 发布者。缺省时详情不展示该行 */
  publisher?: string;
  /** SPDX 或常见许可证名 */
  license?: string;
  pricing?: Pricing;
  /** 截图 URL，有则在详情与网站卡片展示 */
  screenshots?: string[];
  /** 收录日期 YYYY-MM-DD，用于「最新收录」排序 */
  addedAt?: string;
  /** 目录信息更新日期 YYYY-MM-DD */
  updatedAt?: string;
}

function addedAtMs(value: string | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

/** 最新收录在前；没有 addedAt 的条目保持原相对顺序并排在后面。不修改入参。 */
export function sortByNewest<T>(list: readonly T[], addedAt: (item: T) => string | undefined): T[] {
  return list
    .map((item, index) => ({ item, index, time: addedAtMs(addedAt(item)) }))
    .sort((a, b) => (a.time === b.time ? a.index - b.index : b.time - a.time))
    .map((row) => row.item);
}

export const CATEGORIES: { id: CategoryId; label: string }[] = categories as {
  id: CategoryId;
  label: string;
}[];

export const CATALOG: CatalogApp[] = catalog as CatalogApp[];

export const CATALOG_BY_ID: ReadonlyMap<string, CatalogApp> = new Map(
  CATALOG.map((a) => [a.id.toLowerCase(), a]),
);
