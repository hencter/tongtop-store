import { publicStats } from "../../lib/stats.js";
import { readStats } from "../../lib/stats-store.js";

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=60",
};

/** 公开榜单。读取失败时返回空榜，调用方保持默认排序。 */
export async function onRequestGet(context) {
  try {
    const state = await readStats(context.env);
    return new Response(JSON.stringify(publicStats(state)), { headers: HEADERS });
  } catch {
    return new Response(JSON.stringify({ updatedAt: "", top: [] }), { headers: HEADERS });
  }
}
