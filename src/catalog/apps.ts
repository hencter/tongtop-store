/**
 * 精选目录（静态数据，首屏零 IPC 直接渲染）。
 *
 * 定位纪律：本商店**不托管任何安装包**，这里只保存
 * 「winget ID → 官网链接」的分发信息；安装走 winget 官方源，
 * 「官网」按钮直接打开软件官方页面。
 *
 * 所有 ID 均已通过 `winget search --id <id> -e` 逐一验证（winget v1.29）。
 */

export type CategoryId =
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
}

export const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: "browser", label: "浏览器" },
  { id: "social", label: "社交通讯" },
  { id: "office", label: "办公效率" },
  { id: "dev", label: "开发工具" },
  { id: "media", label: "影音创作" },
  { id: "game", label: "游戏平台" },
  { id: "system", label: "系统工具" },
  { id: "netdisk", label: "网盘与远程" },
];

export const CATALOG: CatalogApp[] = [
  // 浏览器
  { id: "Google.Chrome", name: "Chrome", desc: "谷歌浏览器，快速安全的网页浏览", site: "https://www.google.com/chrome/", category: "browser", tags: ["google", "浏览器"] },
  { id: "Mozilla.Firefox", name: "Firefox", desc: "自由开源的火狐浏览器", site: "https://www.mozilla.org/firefox/", category: "browser", tags: ["火狐", "浏览器"] },
  { id: "Microsoft.Edge", name: "Microsoft Edge", desc: "微软新一代浏览器", site: "https://www.microsoft.com/edge", category: "browser", tags: ["微软", "浏览器"] },
  { id: "Tencent.QQBrowser", name: "QQ浏览器", desc: "腾讯出品的极速浏览器", site: "https://browser.qq.com/", category: "browser", tags: ["腾讯", "浏览器"] },

  // 社交通讯
  { id: "Tencent.WeChat", name: "微信", desc: "腾讯微信，是一个生活方式", site: "https://weixin.qq.com/", category: "social", tags: ["wechat", "聊天"] },
  { id: "Tencent.QQ", name: "QQ", desc: "腾讯 QQ 即时通讯", site: "https://im.qq.com/", category: "social", tags: ["腾讯", "聊天"] },
  { id: "Tencent.TIM", name: "TIM", desc: "轻聊版 QQ，办公更简洁", site: "https://tim.qq.com/", category: "social", tags: ["腾讯", "办公"] },
  { id: "Tencent.WeCom", name: "企业微信", desc: "企业的专业办公管理工具", site: "https://work.weixin.qq.com/", category: "social", tags: ["企业", "办公"] },
  { id: "ByteDance.Feishu", name: "飞书", desc: "一站式企业协作平台", site: "https://www.feishu.cn/", category: "social", tags: ["字节", "协作"] },
  { id: "Alibaba.DingTalk.Mainland", name: "钉钉", desc: "阿里出品的企业级智能移动办公平台", site: "https://www.dingtalk.com/", category: "social", tags: ["阿里", "dingtalk"] },

  // 办公效率
  { id: "Kingsoft.WPSOffice", name: "WPS Office", desc: "金山办公，一站式办公服务", site: "https://www.wps.cn/", category: "office", tags: ["金山", "文档"] },
  { id: "Notion.Notion", name: "Notion", desc: "一体化笔记与协作工作区", site: "https://www.notion.so/", category: "office", tags: ["笔记"] },
  { id: "Obsidian.Obsidian", name: "Obsidian", desc: "本地优先的 Markdown 知识库", site: "https://obsidian.md/", category: "office", tags: ["笔记", "markdown"] },
  { id: "Xmind.Xmind", name: "XMind", desc: "全功能思维导图与头脑风暴", site: "https://xmind.cn/", category: "office", tags: ["思维导图"] },
  { id: "appmakes.Typora", name: "Typora", desc: "所见即所得的 Markdown 编辑器", site: "https://typora.io/", category: "office", tags: ["markdown", "编辑器"] },
  { id: "JGraph.Draw", name: "draw.io", desc: "免费开源的流程图与图表绘制", site: "https://www.drawio.com/", category: "office", tags: ["流程图", "绘图", "开源"], github: "jgraph/drawio-desktop" },

  // 开发工具
  { id: "Microsoft.VisualStudioCode", name: "VS Code", desc: "微软出品的代码编辑器", site: "https://code.visualstudio.com/", category: "dev", tags: ["vscode", "编辑器"] },
  { id: "JetBrains.IntelliJIDEA.Community", name: "IntelliJ IDEA 社区版", desc: "Java/Kotlin 集成开发环境", site: "https://www.jetbrains.com/idea/", category: "dev", tags: ["idea", "java"] },
  { id: "Notepad++.Notepad++", name: "Notepad++", desc: "轻量开源的文本编辑器", site: "https://notepad-plus-plus.org/", category: "dev", tags: ["编辑器"], github: "notepad-plus-plus/notepad-plus-plus" },
  { id: "Git.Git", name: "Git", desc: "分布式版本控制系统", site: "https://git-scm.com/", category: "dev", tags: ["版本控制"], github: "git-for-windows/git" },
  { id: "OpenJS.NodeJS.LTS", name: "Node.js LTS", desc: "JavaScript 运行时（长期支持版）", site: "https://nodejs.org/", category: "dev", tags: ["node", "运行时"] },
  { id: "Python.Python.3.13", name: "Python 3.13", desc: "Python 编程语言解释器", site: "https://www.python.org/", category: "dev", tags: ["python", "运行时"] },
  { id: "Postman.Postman", name: "Postman", desc: "API 开发与调试平台", site: "https://www.postman.com/", category: "dev", tags: ["api", "调试"] },
  { id: "Microsoft.WindowsTerminal", name: "Windows Terminal", desc: "现代化多标签终端", site: "https://aka.ms/terminal", category: "dev", tags: ["终端", "微软"], github: "microsoft/terminal" },
  { id: "Genymobile.scrcpy", name: "scrcpy", desc: "开源安卓投屏与电脑控制工具", site: "https://github.com/Genymobile/scrcpy", category: "dev", tags: ["安卓", "投屏", "开源"], github: "Genymobile/scrcpy" },

  // 影音创作
  { id: "VideoLAN.VLC", name: "VLC 播放器", desc: "开源全能媒体播放器", site: "https://www.videolan.org/", category: "media", tags: ["播放器"] },
  { id: "Daum.PotPlayer", name: "PotPlayer", desc: "功能强大的影音播放器", site: "https://potplayer.daum.net/", category: "media", tags: ["播放器"] },
  { id: "NetEase.CloudMusic", name: "网易云音乐", desc: "网易出品的音乐社区", site: "https://music.163.com/", category: "media", tags: ["音乐"] },
  { id: "Tencent.QQMusic", name: "QQ音乐", desc: "腾讯音乐流媒体服务", site: "https://y.qq.com/", category: "media", tags: ["音乐"] },
  { id: "Bilibili.Bilibili", name: "哔哩哔哩", desc: "B 站官方桌面客户端", site: "https://www.bilibili.com/", category: "media", tags: ["b站", "视频"] },
  { id: "ByteDance.JianyingPro", name: "剪映专业版", desc: "抖音官方视频剪辑工具", site: "https://www.capcut.cn/", category: "media", tags: ["剪辑", "视频"] },
  { id: "OBSProject.OBSStudio", name: "OBS Studio", desc: "开源直播与录屏软件", site: "https://obsproject.com/", category: "media", tags: ["直播", "录屏"], github: "obsproject/obs-studio" },
  { id: "Bandisoft.Honeyview", name: "Honeyview", desc: "快速轻量的图片查看器", site: "https://www.bandisoft.com/honeyview/", category: "media", tags: ["看图"] },
  { id: "ShareX.ShareX", name: "ShareX", desc: "开源截图、录屏与文件分享利器", site: "https://getsharex.com/", category: "media", tags: ["截图", "录屏", "开源"], github: "ShareX/ShareX" },
  { id: "lyswhut.lx-music-desktop", name: "洛雪音乐助手", desc: "开源免费的音乐聚合播放器", site: "https://github.com/lyswhut/lx-music-desktop", category: "media", tags: ["音乐", "开源"], github: "lyswhut/lx-music-desktop" },

  // 游戏平台
  { id: "Valve.Steam", name: "Steam", desc: "Valve 数字游戏发行平台", site: "https://store.steampowered.com/", category: "game", tags: ["游戏"] },
  { id: "EpicGames.EpicGamesLauncher", name: "Epic Games", desc: "Epic 游戏商店与启动器", site: "https://www.epicgames.com/", category: "game", tags: ["游戏"] },

  // 系统工具
  { id: "7zip.7zip", name: "7-Zip", desc: "开源高压缩比压缩软件", site: "https://www.7-zip.org/", category: "system", tags: ["压缩"] },
  { id: "Bandisoft.Bandizip", name: "Bandizip", desc: "轻快无广告的压缩软件", site: "https://www.bandisoft.com/bandizip/", category: "system", tags: ["压缩"] },
  { id: "voidtools.Everything", name: "Everything", desc: "毫秒级文件搜索工具", site: "https://www.voidtools.com/", category: "system", tags: ["搜索"] },
  { id: "Microsoft.PowerToys", name: "PowerToys", desc: "微软官方系统增强工具集", site: "https://learn.microsoft.com/windows/powertoys/", category: "system", tags: ["微软", "效率"], github: "microsoft/PowerToys" },
  { id: "FilesCommunity.Files", name: "Files", desc: "现代化设计的文件管理器", site: "https://files.community/", category: "system", tags: ["文件管理器", "开源"], github: "files-community/Files" },
  { id: "Ventoy.Ventoy", name: "Ventoy", desc: "开源多系统启动 U 盘制作工具", site: "https://www.ventoy.net/", category: "system", tags: ["启动盘", "开源"], github: "ventoy/Ventoy" },
  { id: "Rufus.Rufus", name: "Rufus", desc: "轻量可靠的启动盘制作工具", site: "https://rufus.ie/", category: "system", tags: ["启动盘", "开源"], github: "pbatard/rufus" },
  { id: "zhongyang219.TrafficMonitor.Full", name: "TrafficMonitor", desc: "开源网速与硬件监控悬浮窗", site: "https://github.com/zhongyang219/TrafficMonitor", category: "system", tags: ["监控", "开源"], github: "zhongyang219/TrafficMonitor" },
  { id: "agalwood.Motrix", name: "Motrix", desc: "开源全能下载管理器", site: "https://motrix.app/", category: "system", tags: ["下载", "开源"], github: "agalwood/Motrix" },

  // 网盘与远程
  { id: "Baidu.BaiduNetdisk", name: "百度网盘", desc: "百度云存储与文件同步", site: "https://pan.baidu.com/", category: "netdisk", tags: ["网盘"] },
  { id: "Alibaba.aDrive", name: "阿里云盘", desc: "阿里出品的个人云盘", site: "https://www.alipan.com/", category: "netdisk", tags: ["网盘"] },
  { id: "Youqu.ToDesk", name: "ToDesk", desc: "流畅的远程控制软件", site: "https://www.todesk.com/", category: "netdisk", tags: ["远程"] },
];

export const CATALOG_BY_ID: ReadonlyMap<string, CatalogApp> = new Map(
  CATALOG.map((a) => [a.id.toLowerCase(), a]),
);
