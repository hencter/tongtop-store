/**
 * 应用评分：校验提交，并把已通过审核的记录汇总成 /api/data/ratings.json。
 * 用户原文原样保留（调用方必须用 textContent 渲染），这里只做长度和字符校验。
 */

const APP_ID = /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,118}$/;

export function normalizeStars(value) {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

/** 打断 HTML 注释结束符，避免评价正文提前结束 Issue 里的元数据标记。 */
function plain(value, max) {
  return value.replace(/-->/g, "—>").slice(0, max);
}

export function validateRating(body) {
  const name = typeof body?.name === "string" ? plain(body.name.trim(), 80) : "";
  const refId = typeof body?.refId === "string" ? body.refId.trim() : "";
  const desc = typeof body?.desc === "string" ? body.desc.trim() : "";
  const stars = normalizeStars(body?.stars);
  if (!stars) return { error: "评分需要是 1 到 5 的整数" };
  if (!APP_ID.test(refId)) return { error: "应用 ID 不正确" };
  if (!desc) return { error: "请填写简短评价" };
  if (desc.length > 280) return { error: "评价请控制在 280 字以内" };
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(desc)) return { error: "评价包含无法显示的字符" };
  return {
    value: {
      type: "rating",
      name: name || refId,
      refId,
      site: "",
      category: "",
      desc: plain(desc, 280),
      contact: "",
      stars,
    },
  };
}

/** 只统计 approved 的评分。最近评价最多 5 条，新的在前。 */
export function aggregateRatings(records, now = new Date().toISOString()) {
  const groups = new Map();
  for (const record of records ?? []) {
    if (!record || record.type !== "rating" || record.status !== "approved") continue;
    const stars = normalizeStars(record.stars);
    const appId = typeof record.refId === "string" ? record.refId.trim() : "";
    const text = typeof record.desc === "string" ? record.desc.trim() : "";
    if (!stars || !APP_ID.test(appId) || !text) continue;
    const list = groups.get(appId) ?? [];
    list.push({
      stars,
      text,
      createdAt: typeof record.createdAt === "string" ? record.createdAt : "",
    });
    groups.set(appId, list);
  }
  const apps = {};
  for (const [appId, reviews] of groups) {
    reviews.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const count = reviews.length;
    const average = Math.round((reviews.reduce((sum, review) => sum + review.stars, 0) / count) * 10) / 10;
    apps[appId] = { average, count, reviews: reviews.slice(0, 5) };
  }
  return { updatedAt: now, apps };
}
