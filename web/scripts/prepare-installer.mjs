// 构建前把 TongTop Store 最新 Windows 安装包同步进站点 public/downloads。
// 优先使用本地刚构建的 Tauri 安装包；CI/纯网站构建没有本地产物时，从 GitHub latest release 拉取固定资产。
// 拉取失败不阻断站点构建：仓库内已有 public/downloads/tongtop-store-setup.exe 可继续作为兜底。
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(webRoot, "..");
const destDir = path.join(webRoot, "public", "downloads");
const dest = path.join(destDir, "tongtop-store-setup.exe");
const latestReleaseUrl =
  process.env.TONGTOP_RELEASE_INSTALLER_URL ??
  "https://github.com/hencter/tongtop-store/releases/latest/download/tongtop-store-setup.exe";

mkdirSync(destDir, { recursive: true });

const candidates = [];
const bundleDir = path.join(root, "src-tauri", "target", "release", "bundle", "nsis");
if (existsSync(bundleDir)) {
  for (const file of readdirSync(bundleDir)) {
    if (file.toLowerCase().endsWith(".exe")) candidates.push(path.join(bundleDir, file));
  }
}
for (const file of readdirSync(root)) {
  if (file.toLowerCase().endsWith(".exe")) candidates.push(path.join(root, file));
}

if (candidates.length > 0) {
  candidates.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  copyFileSync(candidates[0], dest);
  console.log(`[installer] 本地 ${path.basename(candidates[0])} → public/downloads/tongtop-store-setup.exe`);
  process.exit(0);
}

try {
  console.log(`[installer] 未找到本地安装包，正在同步 latest release：${latestReleaseUrl}`);
  const response = await fetch(latestReleaseUrl, {
    redirect: "follow",
    signal: AbortSignal.timeout(120_000),
    headers: { "user-agent": "tongtop-store-web-build" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length < 100_000) throw new Error(`下载内容异常，仅 ${body.length} bytes`);
  writeFileSync(dest, body);
  console.log(
    `[installer] GitHub latest release → public/downloads/tongtop-store-setup.exe (${(body.length / 1024 / 1024).toFixed(1)} MB)`,
  );
} catch (error) {
  const fallback = existsSync(dest) ? "保留仓库内现有安装包。" : "当前没有可用安装包。";
  console.warn(`[installer] latest release 同步失败：${error instanceof Error ? error.message : String(error)}；${fallback}`);
}
