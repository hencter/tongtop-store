// 构建前把最新 Tauri 安装包拷进站点下载目录。
// 找不到就跳过（站点照常构建），先跑 `pnpm tauri build` 即可。
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(webRoot, "..");

const candidates = [];
const bundleDir = path.join(root, "src-tauri", "target", "release", "bundle", "nsis");
if (existsSync(bundleDir)) {
  for (const f of readdirSync(bundleDir)) {
    if (f.toLowerCase().endsWith(".exe")) candidates.push(path.join(bundleDir, f));
  }
}
for (const f of readdirSync(root)) {
  if (f.toLowerCase().endsWith(".exe")) candidates.push(path.join(root, f));
}

if (candidates.length === 0) {
  console.warn("[installer] 未找到安装包（先执行 pnpm tauri build），跳过拷贝。");
  process.exit(0);
}

candidates.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
const destDir = path.join(webRoot, "public", "downloads");
mkdirSync(destDir, { recursive: true });
const dest = path.join(destDir, "tongtop-store-setup.exe");
copyFileSync(candidates[0], dest);
console.log(`[installer] ${path.basename(candidates[0])} → public/downloads/tongtop-store-setup.exe`);
