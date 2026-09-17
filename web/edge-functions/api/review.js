import { err, isAdmin, json, updateSubmission } from "../lib/submissions.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!isAdmin(request, env)) return err("未授权：请在审核页填写正确的管理令牌", 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return err("请求体需要是 JSON");
  }

  const id = typeof body?.id === "string" ? body.id : "";
  const action = body?.action;
  if (!id || (action !== "approve" && action !== "reject")) return err("参数不正确");

  const record = await updateSubmission(env, id, {
    status: action === "approve" ? "approved" : "rejected",
    note: typeof body.note === "string" ? body.note.slice(0, 300) : "",
  });
  if (!record) return err("提交不存在", 404);

  return json({ ok: true, item: record });
}
