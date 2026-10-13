// 构建后检查：每个应用都有详情页，页面含 canonical / JSON-LD，sitemap 含全部详情地址。
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(webRoot, "..");
const apps = JSON.parse(readFileSync(path.join(repoRoot, "data", "apps.json"), "utf8"));
const dist = path.join(webRoot, "dist");
const sitemapPath = path.join(dist, "sitemap.xml");

if (!existsSync(sitemapPath)) {
  console.error("missing dist/sitemap.xml — run pnpm build first");
  process.exit(1);
}
const sitemap = readFileSync(sitemapPath, "utf8");
let failed = 0;

for (const app of apps) {
  const pagePath = path.join(dist, "apps", app.id, "index.html");
  const loc = `https://store.tongtianlu.cn/apps/${encodeURIComponent(app.id)}`;
  if (!existsSync(pagePath)) {
    console.error(`missing detail page for ${app.id}`);
    failed += 1;
    continue;
  }
  const html = readFileSync(pagePath, "utf8");
  if (!html.includes(`rel="canonical" href="${loc}"`)) {
    console.error(`missing canonical for ${app.id}`);
    failed += 1;
  }
  if (!html.includes('property="og:url"') || !html.includes(loc)) {
    console.error(`missing og:url for ${app.id}`);
    failed += 1;
  }
  if (!html.includes('"@type":"SoftwareApplication"') && !html.includes('"@type": "SoftwareApplication"')) {
    console.error(`missing SoftwareApplication JSON-LD for ${app.id}`);
    failed += 1;
  }
  if (!sitemap.includes(`<loc>${loc}</loc>`)) {
    console.error(`sitemap missing ${loc}`);
    failed += 1;
  }
}

console.log(failed === 0 ? `detail pages ok (${apps.length})` : `${failed} detail-page check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
