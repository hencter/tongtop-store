import { addSubmission, err, json, rateLimited, validate } from "../lib/submissions.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  // 限流：clientIp 是平台提供的可信来源；X-Forwarded-For 首项可被伪造，兜底取最后一项
  const ip =
    context.clientIp || request.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "";
  if (rateLimited(ip)) return err("提交过于频繁，请稍后再试", 429);

  // 存储未配置（无 GITHUB_TOKEN 且非本地开发注入）时如实 503——不假装成功导致数据丢失
  if (!env?.GITHUB_TOKEN && !globalThis.__TONGTOP_STORE__) {
    return err("投稿通道暂不可用（存储未配置），请稍后再试或到 GitHub 提 Issue", 503);
  }

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
