import { err, isAdmin, json, listSubmissions, sanitizePublic } from "../lib/submissions.js";

const ALLOWED_STATUS = new Set(["", "pending", "approved", "rejected"]);

export async function onRequestGet(context) {
  const { request, env } = context;
  const status = new URL(request.url).searchParams.get("status") ?? "";
  if (!ALLOWED_STATUS.has(status)) return err("状态参数不正确");

  const admin = isAdmin(request, env);

  // 公开只读：已通过的提交；其余状态需要管理令牌
  if (!admin && status !== "approved") return err("未授权", 401);

  try {
    const items = await listSubmissions(env, status);
    return json({ ok: true, items: admin ? items : items.map(sanitizePublic) });
  } catch (error) {
    console.error("submission list failed", error);
    return err("提交服务暂时不可用", 502);
  }
}
