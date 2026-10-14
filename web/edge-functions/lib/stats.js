/**
 * 匿名安装/下载计数。公开结果只有应用 id 和次数。
 * 去重键是随机 client id，不保存姓名、账号或设备信息。24 小时窗口用服务器时间。
 */

const APP_ID = /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,118}$/;
const CLIENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const STATS_WINDOW_MS = 24 * 60 * 60 * 1000;
export const TOP_LIMIT = 20;

export function emptyStats() {
  return { seen: {}, counts: {} };
}

export function normalizeStat(body) {
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const version = typeof body?.version === "string" ? body.version.trim().slice(0, 64) : "";
  const client = typeof body?.client === "string" ? body.client.trim() : "";
  if (!APP_ID.test(id)) return { error: "应用 id 不正确" };
  if (version && /[\u0000-\u001F]/.test(version)) return { error: "版本号不正确" };
  if (!CLIENT_ID.test(client)) return { error: "客户端标识不正确" };
  return { value: { id, version, client } };
}

/** 同一 client + 应用在 24h 内只加一次。返回的 state 不含版本号和上报时间以外的身份信息。 */
export function applyStat(state, event, now) {
  const current = state && typeof state === "object" ? state : emptyStats();
  const seen = {};
  for (const [key, at] of Object.entries(current.seen ?? {})) {
    if (typeof at === "number" && now - at < STATS_WINDOW_MS) seen[key] = at;
  }
  const counts = { ...(current.counts ?? {}) };
  const key = `${event.client}|${event.id}`;
  if (seen[key]) return { state: { seen, counts }, counted: false };
  seen[key] = now;
  counts[event.id] = (Number.isInteger(counts[event.id]) ? counts[event.id] : 0) + 1;
  return { state: { seen, counts }, counted: true };
}

export function topStats(state, limit = TOP_LIMIT) {
  const counts = state?.counts ?? {};
  return Object.entries(counts)
    .filter(([id, count]) => APP_ID.test(id) && Number.isInteger(count) && count > 0)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, limit)
    .map(([id, count]) => ({ id, count }));
}

export function publicStats(state, now = new Date().toISOString()) {
  return { updatedAt: now, top: topStats(state) };
}
