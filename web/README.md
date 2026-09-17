# TongTop Store 网站（Astro）

索引站：软件库 / AI 智能体 / 镜像源 / AI 免费额度 + 环境变量配置引导 + 提交审核接口 + 安装包下载。

- 纯静态构建（`astro build` → `dist/`），数据来自仓库根 `data/*.json`（与桌面客户端共用一份数据源）
- 提交审核接口用 EdgeOne Functions（`edge-functions/`），数据存 EdgeOne KV
- 安装包在构建时从 `src-tauri/target/release/bundle/nsis/` 拷到 `public/downloads/`

## 本地开发

```bash
pnpm install
pnpm dev:api     # 终端 1：API（http://localhost:8787，数据落 .data/submissions.json）
pnpm dev         # 终端 2：站点（http://localhost:4321，/api 自动代理）
```

管理令牌：启动 `dev:api` 前设置环境变量 `ADMIN_TOKEN=xxx`（Windows PowerShell：`$env:ADMIN_TOKEN="xxx"`）。

## 构建

```bash
pnpm build       # 拷安装包 + astro build → dist/
```

## 部署到腾讯云 EdgeOne

1. EdgeOne 控制台 → Pages → 导入 Git 仓库
2. **项目根目录填 `web`**，构建命令 `pnpm build`，输出目录 `dist`
3. 环境变量：`ADMIN_TOKEN`（审核接口令牌，务必设置）
4. 存储 → KV：创建命名空间并绑定到项目，**变量名填 `SUBMISSIONS_KV`**（未绑定时审核数据仅存边缘实例内存，重启即丢）
5. 提交审核：`POST /api/submit`；审核：`GET /api/submissions?status=pending`（Bearer 令牌）、`POST /api/review`

### 安装包发布流程

EdgeOne 从 Git 构建，拿不到本地 Rust 产物，所以安装包要跟着仓库走：

```bash
pnpm tauri build                              # 生成 src-tauri/target/release/bundle/nsis/*.exe
pnpm --dir web build                          # 自动拷成 web/public/downloads/tongtop-store-setup.exe
git add web/public/downloads/tongtop-store-setup.exe
```

`web/.gitignore` 已放行这一个文件，其余下载产物忽略。

## 数据维护

| 文件 | 内容 |
| --- | --- |
| `data/apps.json` | 软件目录（winget ID / 官网 / 分类 / AI 标记） |
| `data/agents.json` | AI 智能体装机配方（安装方式 / 环境变量） |
| `data/mirrors.json` | 镜像源预设 |
| `data/categories.json` | 分类 |
| `data/free-models.json` | 免费额度情报（官方链接 + 核验日期） |

链接核验：`pnpm verify:links`（定期跑，失效链接手动更新）。
