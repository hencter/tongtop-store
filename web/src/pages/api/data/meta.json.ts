/**
 * 目录数据清单（静态路由 /api/data/meta.json）：
 * - updatedAt：数据文件的最后修改时间（秒）
 * - files：文件名 → 内容 sha256 前 16 位（客户端可据此做变更检测，无需逐文件拉取）
 * 桌面端 check/refresh 先读此清单再决定拉取哪些文件。
 */
import type { APIRoute } from "astro";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const NAMES = ["apps", "agents", "categories", "devtools", "mirrors", "free-models"];

/** 构建时 cwd 可能是 web/ 也可能是仓库根：向上找含 data/apps.json 的目录 */
function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 5; i += 1) {
    if (existsSync(path.join(dir, "data", "apps.json"))) return dir;
    dir = path.dirname(dir);
  }
  return start;
}

const root = findRepoRoot(process.cwd());
const files: Record<string, string> = {};
let updatedAt = 0;
for (const name of NAMES) {
  const p = path.join(root, "data", `${name}.json`);
  const buf = readFileSync(p);
  files[name] = createHash("sha256").update(buf).digest("hex").slice(0, 16);
  updatedAt = Math.max(updatedAt, Math.floor(statSync(p).mtimeMs / 1000));
}

export const GET: APIRoute = () =>
  new Response(JSON.stringify({ updatedAt, files, count: NAMES.length }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
