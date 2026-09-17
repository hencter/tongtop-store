import { addSubmission, err, json, rateLimited, validate } from "../lib/submissions.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || context.clientIp || "";
  if (rateLimited(ip)) return err("提交过于频繁，请稍后再试", 429);

  let body;
  try {
    body = await request.json();
  } catch {
    return err("请求体需要是 JSON");
  }

  const result = validate(body);
  if (result.error) return err(result.error);

  try {
    const record = await addSubmission(env, result.value);
    return json({ ok: true, id: record.id, message: "已提交，等待审核" }, 201);
  } catch (error) {
    return err(`提交失败：${String(error.message || error)}`, 502);
  }
}
