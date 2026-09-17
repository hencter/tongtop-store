import { getStore } from "./store.js";

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

export const err = (message, status = 400) => json({ ok: false, error: message }, status);

const TYPES = ["app", "agent", "free-model", "correction"];
const str = (value, max = 500) => (typeof value === "string" ? value.trim().slice(0, max) : "");

export function validate(body) {
  const type = TYPES.includes(body?.type) ? body.type : "";
  const name = str(body?.name, 80);
  const refId = str(body?.refId, 120);
  const site = str(body?.site, 300);
  const category = str(body?.category, 40);
  const desc = str(body?.desc, 1000);
  const contact = str(body?.contact, 120);
  if (!type) return { error: "提交类型不正确" };
  if (!name) return { error: "名称必填" };
  if (!desc) return { error: "说明必填" };
  if (site && !/^https?:\/\//i.test(site)) return { error: "链接需要以 http(s):// 开头" };
  return { value: { type, name, refId, site, category, desc, contact } };
}

export async function addSubmission(env, payload, ip) {
  const store = getStore(env);
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const record = {
    id,
    ...payload,
    status: "pending",
    ip: ip ?? "",
    createdAt: new Date().toISOString(),
    reviewedAt: "",
    note: "",
  };
  await store.put(`submission_${id}`, JSON.stringify(record));
  return record;
}

export async function listSubmissions(env, status) {
  const store = getStore(env);
  const keys = await store.list("submission_");
  const out = [];
  for (const { key } of keys) {
    const raw = await store.get(key);
    if (!raw) continue;
    try {
      const record = JSON.parse(raw);
      if (!status || record.status === status) out.push(record);
    } catch {
      // 跳过损坏记录
    }
  }
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return out;
}

export async function updateSubmission(env, id, patch) {
  const store = getStore(env);
  const key = `submission_${id}`;
  const raw = await store.get(key);
  if (!raw) return null;
  const record = { ...JSON.parse(raw), ...patch, reviewedAt: new Date().toISOString() };
  await store.put(key, JSON.stringify(record));
  return record;
}

/** 公开列表脱敏：不带联系方式与 IP */
export function sanitizePublic(record) {
  return {
    id: record.id,
    type: record.type,
    name: record.name,
    refId: record.refId,
    site: record.site,
    category: record.category,
    desc: record.desc,
    status: record.status,
    createdAt: record.createdAt,
    reviewedAt: record.reviewedAt,
  };
}

export function isAdmin(request, env) {
  const token = env?.ADMIN_TOKEN;
  if (!token) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${token}`;
}

/** 简易限流：每个边缘实例内存计数（防刷够用） */
const HITS = new Map();
export function rateLimited(ip, limit = 5, windowMs = 10 * 60 * 1000) {
  if (!ip) return false;
  const now = Date.now();
  const hits = (HITS.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) return true;
  hits.push(now);
  HITS.set(ip, hits);
  return false;
}
