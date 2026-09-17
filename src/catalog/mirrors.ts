/**
 * 镜像中心预设：全部端点已实测可达（2026-09 探测，见提交说明）。
 * value === "" 表示"恢复官方默认"（各工具按自己的方式落盘）。
 */

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

export const MIRROR_TOOLS: MirrorTool[] = [
  {
    id: "winget",
    name: "winget 源",
    desc: "商店自身与 winget 的包索引源，换源后搜索/安装走国内镜像",
    presets: [
      { label: "中科大 USTC", value: "https://mirrors.ustc.edu.cn/winget-source", note: "推荐" },
    ],
    official: "https://cdn.winget.microsoft.com/cache",
    applyNote: "需要管理员权限时会失败，按提示手动执行",
  },
  {
    id: "npm",
    name: "npm 注册表",
    desc: "Node.js 包注册表，AI 智能体（Claude Code 等）的安装速度取决于它",
    needsTool: "npm",
    presets: [
      { label: "npmmirror（淘宝）", value: "https://registry.npmmirror.com", note: "推荐" },
      { label: "腾讯云", value: "https://mirrors.cloud.tencent.com/npm/" },
    ],
    official: "https://registry.npmjs.org",
  },
  {
    id: "pip",
    name: "pip 索引",
    desc: "Python 包索引（PyPI）",
    needsTool: "python",
    presets: [
      { label: "清华 TUNA", value: "https://pypi.tuna.tsinghua.edu.cn/simple", note: "推荐" },
      { label: "阿里云", value: "https://mirrors.aliyun.com/pypi/simple/" },
      { label: "中科大 USTC", value: "https://mirrors.ustc.edu.cn/pypi/simple" },
    ],
    official: "https://pypi.org/simple",
  },
  {
    id: "cargo",
    name: "Cargo（Rust）",
    desc: "crates.io 索引与下载，写入 ~/.cargo/config.toml（只改标记块，可恢复）",
    presets: [
      { label: "字节 rsproxy", value: "sparse+https://rsproxy.cn/index/", note: "推荐" },
      { label: "中科大 USTC", value: "sparse+https://mirrors.ustc.edu.cn/crates.io-index/" },
      { label: "清华 TUNA", value: "sparse+https://mirrors.tuna.tsinghua.edu.cn/crates.io-index/" },
    ],
    official: "",
  },
  {
    id: "docker",
    name: "Docker 镜像加速",
    desc: "registry-mirrors 写入 ~/.docker/daemon.json（保留其他配置）",
    needsTool: "docker",
    presets: [
      { label: "1Panel", value: "https://docker.1panel.live", note: "推荐" },
      { label: "毫秒镜像（1ms）", value: "https://docker.1ms.run" },
      { label: "DaoCloud", value: "https://docker.m.daocloud.io" },
    ],
    official: "",
    applyNote: "重启 Docker Desktop 后生效",
  },
  {
    id: "go",
    name: "Go 模块代理",
    desc: "GOPROXY，go env -w 落盘",
    needsTool: "go",
    presets: [
      { label: "goproxy.cn（七牛）", value: "https://goproxy.cn,direct", note: "推荐" },
      { label: "阿里云", value: "https://mirrors.aliyun.com/goproxy/,direct" },
    ],
    official: "https://proxy.golang.org,direct",
  },
];

/** GitHub 下载加速（只影响本商店打开的 GitHub 资产链接，不改系统配置） */
export const GH_PROXY_PRESETS: MirrorPreset[] = [
  { label: "直连 GitHub", value: "" },
  { label: "ghfast.top 加速", value: "https://ghfast.top/", note: "推荐网络不佳时" },
  { label: "gh-proxy.com 加速", value: "https://gh-proxy.com/" },
];
