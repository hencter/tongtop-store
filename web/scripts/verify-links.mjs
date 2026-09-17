// 免费额度情报的官方链接核验：HEAD 请求，非 4xx/5xx 视为存活（401/403/405 也算，可能拦爬虫）。
// 用法：pnpm verify:links（定期跑一遍，失效的链接改 data/free-models.json）
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataFile = path.join(webRoot, "..", "data", "free-models.json");
const data = JSON.parse(readFileSync(dataFile, "utf8"));

let failed = 0;
for (const provider of data.providers) {
  const targets = [
    ["official", provider.official],
    ["docs", provider.docs],
  ];
  for (const [label, url] of targets) {
    if (!url) continue;
    try {
      // 有些站点拒绝 HEAD，用 GET 并主动取消响应体
      const resp = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(20000),
        headers: { "user-agent": "Mozilla/5.0 (compatible; tongtop-store-link-check)" },
      });
      await resp.body?.cancel().catch(() => {});
      const ok = resp.status < 400 || [401, 403, 405].includes(resp.status);
      console.log(`${ok ? "✓" : "✗"} ${provider.id} ${label} ${resp.status} ${url}`);
      if (!ok) failed += 1;
    } catch (error) {
      console.log(`✗ ${provider.id} ${label} ERR ${error.message} ${url}`);
      failed += 1;
    }
  }
}

console.log(failed === 0 ? "\n全部链接可用" : `\n${failed} 个链接需要处理`);
process.exit(failed === 0 ? 0 : 1);
