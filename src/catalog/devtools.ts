/**
 * 开发语言包管理器目录：已安装页「包管理器」分栏的数据源。
 * 检测走 checkTools（bin 探测），安装/卸载走 winget，镜像配置跳镜像中心。
 * 数据本体在 /data/devtools.json。winget ID 均经 `winget search -e` 实测。
 */

import devtools from "../../data/devtools.json";

export interface DevTool {
  id: string;
  /** 显示名（含生态，如 Node.js · npm） */
  name: string;
  /** 语言生态标签 */
  lang: string;
  desc: string;
  /** 检测用可执行名（checkTools） */
  bin: string;
  /** 安装/卸载用 winget 包 ID */
  winget: string;
  homepage: string;
  /** 镜像中心对应工具 id（有则显示「配置镜像」入口） */
  mirrorId?: string;
}

export const DEVTOOLS: DevTool[] = devtools as DevTool[];
