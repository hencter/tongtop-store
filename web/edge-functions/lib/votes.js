/**
 * 点赞 / 踩计数存储（与 lib/store.js 的兜底思路一致，但键值形态更适合高频小写入）：
 * - 生产：EdgeOne KV（绑定名按 KV / VOTES_KV / VOTES / TONGTOP_KV 顺序探测），
 *   键 `vote:<id>`，值 JSON `{"up":n,"down":n}`
 * - 本地 / 未绑定 KV：内存兜底（重启即丢，仅供联调）
 *
 * 计数键与商店条目对齐：软件用 winget ID（如 `7zip.7zip`），智能体用 `agent:<id>`。
 *
 * 注意：KV 没有原子自增，这里的"读-改-写"是**非强一致**的示例实现——
 * 同一 id 的并发投票可能互相覆盖而丢票。对点赞这种弱一致场景够用；
 * 若日后要精确计数，应换成 Durable Object / D1 的原子更新。
 */

const MEM = (globalThis.__TONGTOP_VOTE_STORE__ ??= new Map());

/** id 白名单：winget ID / npm 包名 / `agent:<id>` 都能通过 */
const ID_RE = /^[A-Za-z0-9._:@\-]{1,120}$/;

/** 单次查询上限（前端按 50 一批分片请求） */
export const MAX_IDS = 50;

export function isValidVoteId(id) {
  return typeof id === "string" && ID_RE.test(id);
}

/** "up"/1/"1" → "up"；"down"/-1/"-1" → "down"；其余返回空串（非法） */
export function normalizeValue(value) {
  if (value === "up" || value === 1 || value === "1") return "up";
  if (value === "down" || value === -1 || value === "-1") return "down";
  return "";
}

const ZERO = { up: 0, down: 0 };

function parseCounts(raw) {
  if (!raw) return { ...ZERO };
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return { ...ZERO };
    }
  }
  const up = Number(value?.up);
  const down = Number(value?.down);
  return {
    up: Number.isFinite(up) && up > 0 ? Math.floor(up) : 0,
    down: Number.isFinite(down) && down > 0 ? Math.floor(down) : 0,
  };
}

function kvStore(kv) {
  const keyOf = (id) => `vote:${id}`;
  return {
    async get(id) {
      return parseCounts(await kv.get(keyOf(id)));
    },
    async set(id, counts) {
      await kv.put(keyOf(id), JSON.stringify(counts));
    },
    kind: "kv",
  };
}

function memoryStore() {
  const keyOf = (id) => `vote:${id}`;
  return {
    async get(id) {
      return parseCounts(MEM.get(keyOf(id)));
    },
    async set(id, counts) {
      MEM.set(keyOf(id), JSON.stringify(counts));
    },
    kind: "memory",
  };
}

/** 取投票存储：绑定 KV 优先，否则内存兜底 */
export function getVoteStore(env) {
  const kv = env?.KV ?? env?.VOTES_KV ?? env?.VOTES ?? env?.TONGTOP_KV;
  return kv && typeof kv.get === "function" && typeof kv.put === "function"
    ? kvStore(kv)
    : memoryStore();
}

/** 批量读计数；缺失 id 一律返回 { up: 0, down: 0 } */
export async function readVotes(env, ids) {
  const store = getVoteStore(env);
  const pairs = await Promise.all(
    ids.map(async (id) => [id, await store.get(id).catch(() => ({ ...ZERO }))]),
  );
  return Object.fromEntries(pairs);
}

/** 读-改-写累加一票，返回该 id 的最新计数（非强一致，见文件头注释） */
export async function castVote(env, id, value) {
  const store = getVoteStore(env);
  const current = await store.get(id).catch(() => ({ ...ZERO }));
  const next = {
    up: current.up + (value === "up" ? 1 : 0),
    down: current.down + (value === "down" ? 1 : 0),
  };
  await store.set(id, next);
  return next;
}
