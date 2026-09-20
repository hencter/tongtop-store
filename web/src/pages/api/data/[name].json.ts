/**
 * 目录数据 API（Astro 静态路由，构建时预渲染为 /api/data/<name>.json）：
 * 桌面端首页推荐、智能体、软件目录、包管理器、镜像源的实时同步数据源。
 * 与 /data/*.json 同源同 schema；路径与旧版 public 静态文件完全兼容（老客户端无需改）。
 */
import type { APIRoute } from "astro";
import apps from "../../../../../data/apps.json";
import agents from "../../../../../data/agents.json";
import categories from "../../../../../data/categories.json";
import devtools from "../../../../../data/devtools.json";
import mirrors from "../../../../../data/mirrors.json";
import freeModels from "../../../../../data/free-models.json";

const FILES: Record<string, unknown> = {
  apps,
  agents,
  categories,
  devtools,
  mirrors,
  "free-models": freeModels,
};

export function getStaticPaths() {
  return Object.keys(FILES).map((name) => ({ params: { name } }));
}

export const GET: APIRoute = ({ params }) => {
  const name = params.name ?? "";
  const data = FILES[name];
  if (data === undefined) {
    return new Response(JSON.stringify({ ok: false, error: `未知数据文件：${name}` }), {
      status: 404,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};
