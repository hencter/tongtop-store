/**
 * GitHub 发布资产的挑选与展示格式化（纯函数，可单测）。
 * 判据：Windows 用户要的是 x64 安装包/便携包，
 * 源码包（Source code）与 arm/32 位默认沉底或过滤。
 */

import type { GhAsset } from "../ipc/types";

const WIN_EXT = /\.(exe|msi|msix|msixbundle|appx|zip)$/i;
const SOURCE_LIKE = /source|\.tar\.(gz|xz|bz2)|\.tgz$/i;
const ARM = /arm(64|ec)/i;
const X86_ONLY = /(^|[^0-9])x86([^0-9]|$)|32[-_]?bit|win32/i;
const X64 = /x64|64[-_]?bit|win64|amd64/i;

/** 从发布资产里挑出 Windows 用户该看的，按推荐度排序。 */
export function pickWindowsAssets(assets: GhAsset[]): GhAsset[] {
  const score = (a: GhAsset): number => {
    const n = a.name;
    if (SOURCE_LIKE.test(n)) return -1;
    let s = 0;
    if (WIN_EXT.test(n)) s += 10;
    if (/win|windows/i.test(n)) s += 6;
    if (X64.test(n)) s += 5;
    if (/setup|installer/i.test(n)) s += 3;
    if (ARM.test(n)) s -= 8;
    if (X86_ONLY.test(n) && !X64.test(n)) s -= 5;
    return s;
  };
  return assets
    .map((a) => ({ a, s: score(a) }))
    .filter((x) => x.s >= 5)
    .sort((x, y) => y.s - x.s || y.a.downloads - x.a.downloads)
    .map((x) => x.a);
}

export function formatSize(bytes: number): string {
  if (bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatDownloads(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)} 万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)} 千`;
  return String(n);
}
