// 构建前把 /data 目录数据发布为站点静态 JSON API：
//   public/api/data/{apps,agents,categories,mirrors,devtools,free-models}.json
//   public/api/data/meta.json（updatedAt = 构建时间，桌面端做新鲜度判断）
// 桌面端首页推荐实时拉取这些文件（Rust ureq 直连，无 CORS 问题），内置数据兜底。
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(webRoot, "..");
const dataDir = path.join(root, "data");
const destDir = path.join(webRoot, "public", "api", "data");

mkdirSync(destDir, { recursive: true });
let count = 0;
for (const f of readdirSync(dataDir)) {
  if (!f.endsWith(".json")) continue;
  copyFileSync(path.join(dataDir, f), path.join(destDir, f));
  count += 1;
}
writeFileSync(
  path.join(destDir, "meta.json"),
  JSON.stringify({ updatedAt: Math.floor(Date.now() / 1000), files: count }),
);
console.log(`[catalog] ${count} 个数据文件 → public/api/data/（meta.updatedAt 已写入）`);
