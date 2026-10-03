import { err, json, rateLimited } from "../lib/submissions.js";
import { MAX_IDS, castVote, isValidVoteId, normalizeValue, readVotes } from "../lib/votes.js";

/**
 * GET /api/votes?ids=7zip.7zip,agent:dsh
 *   → { ok: true, votes: { "7zip.7zip": { up: 3, down: 1 }, ... } }
 *   缺失的 id 返回 { up: 0, down: 0 }；一次最多 50 个 id。
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  const raw = new URL(request.url).searchParams.get("ids") ?? "";
  const ids = [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
  if (ids.length === 0) return err("ids 参数必填（逗号分隔）");
  if (ids.length > MAX_IDS) return err(`一次最多查询 ${MAX_IDS} 个 id`);
  const bad = ids.find((id) => !isValidVoteId(id));
  if (bad) return err(`id 不合法：${bad.slice(0, 40)}`);

  try {
    return json({ ok: true, votes: await readVotes(env, ids) });
  } catch (error) {
    return err(`读取计数失败：${String(error?.message || error)}`, 502);
  }
}

/**
 * POST /api/votes  body { "id": "agent:dsh", "value": "up" | "down" }
 *   → { ok: true, id, up, down, votes: { "<id>": { up, down } } }
 * value 也接受 1 / -1 归一化；限流 20 次 / 10 分钟 / IP。
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  // 限流：clientIp 是平台提供的可信来源；X-Forwarded-For 首项可被伪造，兜底取最后一项
  const ip =
    context.clientIp || request.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "";
  if (rateLimited(ip, 20, 10 * 60 * 1000)) return err("投票过于频繁，请稍后再试", 429);

  let body;
  try {
    body = await request.json();
  } catch {
    return err("请求体需要是 JSON");
  }

  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!isValidVoteId(id)) return err("id 不合法");

  const value = normalizeValue(body?.value);
  if (!value) return err("value 只能是 up / down（也接受 1 / -1）");

  try {
    const counts = await castVote(env, id, value);
    return json({ ok: true, id, up: counts.up, down: counts.down, votes: { [id]: counts } });
  } catch (error) {
    return err(`投票失败：${String(error?.message || error)}`, 502);
  }
}
