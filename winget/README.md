# winget 提交

`TongTianLu.TongTopStore` 的 winget 清单，按版本存放：

```
winget/TongTianLu.TongTopStore/<version>/
  TongTianLu.TongTopStore.yaml                 # version
  TongTianLu.TongTopStore.installer.yaml       # installer（NSIS / user scope）
  TongTianLu.TongTopStore.locale.en-US.yaml    # 默认语言
  TongTianLu.TongTopStore.locale.zh-CN.yaml    # 中文
```

## 新版本发布流程

```bash
pnpm tauri build                # 1. 生成安装包
# 2. 发布 GitHub Release（安装包必须公网可下载，winget CI 会校验）
node scripts/winget-bump.mjs    # 3. 生成新版本清单（默认取 package.json 版本）
winget validate --manifest winget/TongTianLu.TongTopStore/<version>
wingetcreate submit \
  --prtitle "New package: TongTianLu.TongTopStore version <version>" \
  --token <github-token> \
  winget/TongTianLu.TongTopStore/<version>
```

已有包的新版本用 `wingetcreate update TongTianLu.TongTopStore --version <version> --urls <url> --submit` 也可以。

## 注意

- 首次提交 PR 需要在 PR 里回复 `@microsoft-github-policy-service agree` 签署 CLA（只能由仓库所有者操作）
- 安装包元数据：Publisher `tongtianlu`、DisplayName `tongtop-store`、Scope user（来自 Tauri NSIS）
- 当前包标识：https://github.com/microsoft/winget-pkgs/pull/436628
