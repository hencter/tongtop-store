// 本地 API 调试服务器：直接运行 EdgeOne 风格的 edge-functions 处理器，
// 数据落盘 web/.data/submissions.json（重启不丢）。
// 用法：pnpm dev:api（另开一个终端 pnpm dev，/api 自动代理到这里）
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(webRoot, ".data");
const dataFile = path.join(dataDir, "submissions.json");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const mem = new Map(
  existsSync(dataFile) ? Object.entries(JSON.parse(readFileSync(dataFile, "utf8"))) : [],
);
const persist = () => writeFileSync(dataFile, JSON.stringify(Object.fromEntries(mem), null, 2));

globalThis.__TONGTOP_STORE__ = {
  async get(key) {
    return mem.get(key) ?? null;
  },
  async put(key, value) {
    mem.set(key, value);
    persist();
  },
  async delete(key) {
    mem.delete(key);
    persist();
  },
  async list(prefix) {
    return [...mem.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key }));
  },
};

const ROUTES = {
  "/api/submit": "edge-functions/api/submit.js",
  "/api/submissions": "edge-functions/api/submissions.js",
  "/api/review": "edge-functions/api/review.js",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const file = ROUTES[url.pathname];
  if (!file) {
    res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: "not found" }));
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  const request = new Request(url, {
    method: req.method,
    headers: req.headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
  });

  const mod = await import(pathToFileURL(path.join(webRoot, file)).href);
  const handler = req.method === "POST" ? mod.onRequestPost : mod.onRequestGet;
  const context = { request, env: process.env, params: {}, clientIp: req.socket.remoteAddress };
  const response = handler ? await handler(context) : new Response("method not allowed", { status: 405 });

  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  res.end(Buffer.from(await response.arrayBuffer()));
});

server.listen(8787, () => {
  console.log("API dev server → http://localhost:8787");
  console.log("管理令牌取自环境变量 ADMIN_TOKEN（未设置时审核接口不可用）");
});
