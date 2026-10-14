import { listSubmissions } from "../../lib/submissions.js";
import { aggregateRatings } from "../../lib/ratings.js";

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=60",
};

let cache = { at: 0, body: "" };

/** 已通过审核的评分汇总。失败时返回空表，页面显示「暂无评分」。 */
export async function onRequestGet(context) {
  const now = Date.now();
  if (cache.body && now - cache.at < 60_000) {
    return new Response(cache.body, { headers: HEADERS });
  }
  try {
    const items = await listSubmissions(context.env, "approved");
    const body = JSON.stringify(aggregateRatings(items));
    cache = { at: now, body };
    return new Response(body, { headers: HEADERS });
  } catch {
    return new Response(JSON.stringify({ updatedAt: "", apps: {} }), { headers: HEADERS });
  }
}
