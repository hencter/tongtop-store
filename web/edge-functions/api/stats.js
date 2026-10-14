import { applyStat, normalizeStat } from "../lib/stats.js";
import { readStats, writeStats } from "../lib/stats-store.js";
import { err, json } from "../lib/submissions.js";

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return err("请求体需要是 JSON");
  }
  const parsed = normalizeStat(body);
  if (parsed.error) return err(parsed.error);
  try {
    const state = await readStats(context.env);
    const next = applyStat(state, parsed.value, Date.now());
    if (next.counted) await writeStats(context.env, next.state);
    return json({ ok: true, counted: next.counted });
  } catch {
    return err("统计暂不可用", 503);
  }
}
