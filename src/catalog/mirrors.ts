/**
 * 镜像中心预设：全部端点已实测可达（2026-09 探测，见提交说明）。
 * value === "" 表示"恢复官方默认"（各工具按自己的方式落盘）。
 *
 * 数据本体在 /data/mirrors.json（与 Astro 网站共用一份数据源）。
 */

import mirrors from "../../data/mirrors.json";

export interface MirrorPreset {
  label: string;
  value: string;
  note?: string;
}

export interface MirrorTool {
  id: string;
  name: string;
  desc: string;
  /** 检测/应用依赖的本机工具（未安装时禁用操作） */
  needsTool?: string;
  presets: MirrorPreset[];
  /** 恢复官方时的值 */
  official: string;
  applyNote?: string;
}

export const MIRROR_TOOLS: MirrorTool[] = mirrors.tools as MirrorTool[];

/** GitHub 下载加速（只影响本商店打开的 GitHub 资产链接，不改系统配置） */
export const GH_PROXY_PRESETS: MirrorPreset[] = mirrors.ghProxies as MirrorPreset[];
