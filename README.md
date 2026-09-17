# TongTop Store

Windows 桌面应用商店（Tauri 2 + React 19 + TypeScript）+ Astro 索引站。

- 桌面端：精选软件目录（winget 安装）、AI 智能体一键装机（装运行时 → 装本体 → 写密钥 → 启动）、镜像源管理、缓存清理、自动更新
- 索引站（`web/`）：软件库 / 智能体 / 镜像 / AI 免费额度索引 + 环境变量配置引导 + 提交审核接口 + 安装包下载
- 数据：`data/*.json` 为唯一数据源，桌面端与网站共用

## 开发

```bash
pnpm install          # 桌面端依赖
pnpm dev              # 桌面端（Vite）

cd web && pnpm install
pnpm dev:api          # 网站 API（8787，ADMIN_TOKEN=xxx 启用审核）
pnpm dev              # 网站（4321，/api 自动代理）
```

## 构建

```bash
pnpm tauri build      # 桌面端安装包 → src-tauri/target/release/bundle/nsis/
pnpm --dir web build  # 网站 → web/dist/（自动把最新安装包拷进下载目录）
```

## 目录

| 路径 | 说明 |
| --- | --- |
| `src/` | 桌面端前端（React） |
| `src-tauri/` | 桌面端宿主（Rust） |
| `data/` | 目录数据：apps / agents / mirrors / categories / free-models |
| `web/` | Astro 索引站（EdgeOne Pages：项目根 `web`，输出 `dist`，函数在 `edge-functions/`） |
| `scripts/fetch-icons.mjs` | 图标抓取（Iconify + 官网 favicon 兜底，生成 `src/catalog/appIcons.ts`） |

## 网站部署（腾讯云 EdgeOne）

1. 导入仓库，项目根目录 `web`，构建命令 `pnpm build`，输出 `dist`
2. 环境变量 `ADMIN_TOKEN`；KV 命名空间绑定变量名 `SUBMISSIONS_KV`
3. 详见 `web/README.md`
