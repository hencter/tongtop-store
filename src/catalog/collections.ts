/**
 * 精选页的分组（issue #26）。
 *
 * 分组只写 winget ID，具体的名称/简介/官网仍来自目录数据（内置 data/apps.json +
 * 网站 API 实时更新），所以这里不会和目录数据产生两套描述。
 *
 * 挑选标准写得明明白白：**日常真会用到的软件**，按用途分组，方便「先把常用的装上」。
 * 目录里没有对应 ID 的条目在渲染时自动跳过（目录更新不会让页面崩）。
 */

import type { CategoryId } from "./apps";

export interface CuratedCollection {
  id: string;
  /** 中文即 i18n key */
  label: string;
  /** 一句话说明这组装来干什么 */
  desc: string;
  /** 归属用途（目录分类 id，用于「按用途浏览」跳转） */
  category: CategoryId;
  ids: string[];
}

export const ESSENTIALS: CuratedCollection = {
  id: "essentials",
  label: "装机必备",
  desc: "重装系统后最先补上的那些：解压、输入、播放、沟通、加速下载",
  category: "system",
  ids: [
    "7zip.7zip",
    "Tencent.WeChat",
    "Tencent.QQ",
    "Google.Chrome",
    "Microsoft.Edge",
    "VideoLAN.VLC",
    "Daum.PotPlayer",
    "voidtools.Everything",
    "Microsoft.PowerToys",
    "Notepad++.Notepad++",
    "Motrix",
    "Baidu.BaiduNetdisk",
  ],
};

export const CURATED_COLLECTIONS: CuratedCollection[] = [
  {
    id: "browser",
    label: "浏览器",
    desc: "上网入口，先装一个趁手的",
    category: "browser",
    ids: ["Google.Chrome", "Microsoft.Edge", "Mozilla.Firefox", "Tencent.QQBrowser"],
  },
  {
    id: "social",
    label: "社交通讯",
    desc: "聊天、开会、团队协作",
    category: "social",
    ids: ["Tencent.WeChat", "Tencent.QQ", "Tencent.WeCom", "ByteDance.Feishu", "Alibaba.DingTalk.Mainland", "Tencent.TIM"],
  },
  {
    id: "office",
    label: "办公效率",
    desc: "文档、笔记、思维导图与绘图",
    category: "office",
    ids: [
      "Kingsoft.WPSOffice",
      "Notion.Notion",
      "Obsidian.Obsidian",
      "appmakes.Typora",
      "Xmind.Xmind",
      "JGraph.Draw",
    ],
  },
  {
    id: "dev",
    label: "开发工具",
    desc: "编辑器、运行时、包管理与调试工具一次配齐",
    category: "dev",
    ids: [
      "Microsoft.VisualStudioCode",
      "Git.Git",
      "OpenJS.NodeJS.LTS",
      "Python.Python.3.13",
      "Microsoft.WindowsTerminal",
      "GitHub.cli",
      "JetBrains.IntelliJIDEA.Community",
      "Postman.Postman",
    ],
  },
  {
    id: "media",
    label: "影音与创作",
    desc: "听歌看片、录屏截图、剪辑直播",
    category: "media",
    ids: [
      "VideoLAN.VLC",
      "Daum.PotPlayer",
      "NetEase.CloudMusic",
      "Bilibili.Bilibili",
      "ByteDance.JianyingPro",
      "OBSProject.OBSStudio",
      "ShareX.ShareX",
      "Bandisoft.Honeyview",
    ],
  },
  {
    id: "netdisk",
    label: "网盘与远程",
    desc: "文件同步与远程控制",
    category: "netdisk",
    ids: ["Baidu.BaiduNetdisk", "Alibaba.aDrive", "Youqu.ToDesk", "Nutstore.Nutstore"],
  },
  {
    id: "system",
    label: "系统与维护",
    desc: "压缩、启动盘、系统增强与状态监控",
    category: "system",
    ids: [
      "7zip.7zip",
      "Bandisoft.Bandizip",
      "voidtools.Everything",
      "Microsoft.PowerToys",
      "FilesCommunity.Files",
      "Rufus.Rufus",
      "Ventoy.Ventoy",
      "agalwood.Motrix",
      "zhongyang219.TrafficMonitor.Full",
      "Genymobile.scrcpy",
    ],
  },
  {
    id: "ai",
    label: "AI 应用",
    desc: "对话、写代码、本地跑模型",
    category: "ai",
    ids: [
      "Anthropic.Claude",
      "Anysphere.Cursor",
      "Codeium.Windsurf",
      "kangfenmao.CherryStudio",
      "Bin-Huang.Chatbox",
      "ElementLabs.LMStudio",
      "MoonshotAI.Kimi",
      "Perplexity.Perplexity",
    ],
  },
  {
    id: "game",
    label: "游戏平台",
    desc: "游戏库与联机平台",
    category: "game",
    ids: ["Valve.Steam", "EpicGames.EpicGamesLauncher"],
  },
];

