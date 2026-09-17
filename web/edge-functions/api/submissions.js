import { err, isAdmin, json, listSubmissions, sanitizePublic } from "../lib/submissions.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const status = new URL(request.url).searchParams.get("status") ?? "";
  const admin = isAdmin(request, env);

  // 公开只读：已通过的提交；其余状态需要管理令牌
  if (!admin && status !== "approved") return err("未授权", 401);

  const items = await listSubmissions(env, status);
  return json({ ok: true, items: admin ? items : items.map(sanitizePublic) });
}
