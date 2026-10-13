/**
 * 通天路 Skills 客户端。
 *
 * 凭据只来自调用方传入的配置（环境变量 TONGTIANLU_API_BASE / TONGTIANLU_JWT，
 * 或用户在设置里填写的值），仓库里不放真实 JWT。没有凭据时使用内置 mock。
 *
 * 协议：GET /api/v1/skills → GET /api/v1/skills/:slug 取最新过审版本 →
 * GET /api/v1/skills/:slug/versions/:id/package。出错时响应为 { error: { code, message } }。
 * 站点不返回限流头，失败时按指数退避重试，并回退到本地缓存。
 */

import catalog from "../../../data/skills.json";

export type SkillPricing = "free" | "paid";

export interface SkillSummary {
  slug: string;
  name: string;
  summary: string;
  version: string;
  versionId: string;
  pricing: SkillPricing;
}

export interface SkillFile {
  path: string;
  sha256: string;
  text?: string;
  contentBase64?: string;
}

export interface SkillPackage {
  slug: string;
  versionId: string;
  version: string;
  files: SkillFile[];
}

export interface TongtianluConfig {
  apiBase: string;
  jwt: string;
}

export interface KvCache {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export interface SkillClientOptions {
  config: TongtianluConfig;
  fetchImpl?: typeof fetch;
  cache?: KvCache;
  sleep?: (ms: number) => Promise<void>;
  /** 不含首次请求的额外重试次数 */
  retries?: number;
  baseMs?: number;
  now?: () => number;
}

const MOCK_BODIES: Record<string, { path: string; text: string }[]> = {
  "tongtop-agent-access": [
    {
      path: "SKILL.md",
      text: "# 通顶智能体接入\n\n让智能体读取本机已安装技能。\n",
    },
    {
      path: "references/usage.md",
      text: "安装后由桌面端写入技能目录。\n",
    },
  ],
  "news-aggregator": [
    {
      path: "SKILL.md",
      text: "# 新闻聚合\n\n汇总公开新闻源并给出摘要。\n",
    },
    {
      path: "scripts/sources.txt",
      text: "https://example.com/news\n",
    },
  ],
  "ttl-probe-skill": [
    {
      path: "SKILL.md",
      text: "# 通天路探测\n\n付费技能示例，需 ttag_ 智能体 key 解锁。\n",
    },
    {
      path: "assets/note.txt",
      text: "paid\n",
    },
  ],
};

const mockPackages = new Map<string, SkillPackage>();

export function configFromEnv(env: Record<string, string | undefined>): TongtianluConfig {
  return {
    apiBase: (env.TONGTIANLU_API_BASE ?? "").trim().replace(/\/$/, ""),
    jwt: (env.TONGTIANLU_JWT ?? "").trim(),
  };
}

export function hasCredentials(config: TongtianluConfig): boolean {
  return Boolean(config.apiBase && config.jwt);
}

export const MOCK_SKILLS: SkillSummary[] = (catalog as SkillSummary[]).map((item) => ({ ...item }));

export function memoryCache(): KvCache {
  const map = new Map<string, string>();
  return {
    get: (key) => map.get(key) ?? null,
    set: (key, value) => {
      map.set(key, value);
    },
  };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getMockPackage(slug: string): Promise<SkillPackage | null> {
  const skill = MOCK_SKILLS.find((item) => item.slug === slug);
  const bodies = MOCK_BODIES[slug];
  if (!skill || !bodies) return null;
  const cached = mockPackages.get(slug);
  if (cached) return cached;
  const files: SkillFile[] = [];
  for (const body of bodies) {
    const bytes = new TextEncoder().encode(body.text);
    files.push({ path: body.path, text: body.text, sha256: await sha256Hex(bytes) });
  }
  const pkg: SkillPackage = { slug, versionId: skill.versionId, version: skill.version, files };
  mockPackages.set(slug, pkg);
  return pkg;
}

/** JWT 过期（签发后 7 天）时给出明确提示。不校验签名，只看 exp。 */
export function jwtStatus(token: string, now = Date.now()): { expired: boolean; message?: string } {
  if (!token) return { expired: false };
  const part = token.split(".")[1];
  if (!part) return { expired: true, message: "JWT 格式不正确，请重新登录" };
  try {
    const payload = JSON.parse(decodeBase64Url(part)) as { exp?: number };
    if (typeof payload.exp !== "number") return { expired: false };
    if (payload.exp * 1000 <= now) {
      return { expired: true, message: "登录已过期（JWT 有效期 7 天），请重新登录" };
    }
    return { expired: false };
  } catch {
    return { expired: true, message: "JWT 无法解析，请重新登录" };
  }
}

export async function withBackoff<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const retries = opts.retries ?? 3;
  const baseMs = opts.baseMs ?? 500;
  const sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (attempt === retries) break;
      await sleep(baseMs * 2 ** attempt);
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

export async function syncSkills(opts: SkillClientOptions): Promise<{ skills: SkillSummary[]; source: "remote" | "cache" | "mock"; warning?: string }> {
  const cache = opts.cache ?? memoryCache();
  if (!hasCredentials(opts.config)) {
    return { skills: MOCK_SKILLS, source: "mock" };
  }
  const status = jwtStatus(opts.config.jwt, opts.now?.());
  if (status.expired) {
    const cached = readCachedList(cache);
    if (cached) return { skills: cached, source: "cache", warning: status.message };
    throw new Error(status.message);
  }
  try {
    const skills = await withBackoff(() => fetchSkillList(opts), opts);
    cache.set("skills:list", JSON.stringify(skills));
    return { skills, source: "remote" };
  } catch (error) {
    const cached = readCachedList(cache);
    if (cached) {
      return { skills: cached, source: "cache", warning: error instanceof Error ? error.message : String(error) };
    }
    throw error;
  }
}

export async function fetchPackage(slug: string, opts: SkillClientOptions): Promise<SkillPackage> {
  const cache = opts.cache ?? memoryCache();
  const skill = (await syncSkills({ ...opts, cache })).skills.find((item) => item.slug === slug);
  if (!skill) throw new Error(`未找到技能 ${slug}`);
  if (skill.pricing === "paid") {
    throw new Error(paidUnlockMessage());
  }
  if (!hasCredentials(opts.config)) {
    const mock = await getMockPackage(slug);
    if (!mock) throw new Error(`没有 ${slug} 的示例包`);
    return mock;
  }
  const cacheKey = `skills:pkg:${slug}:${skill.versionId}`;
  try {
    const pkg = await withBackoff(() => fetchRemotePackage(skill, opts), opts);
    cache.set(cacheKey, JSON.stringify(pkg));
    return pkg;
  } catch (error) {
    const raw = cache.get(cacheKey);
    if (raw) return JSON.parse(raw) as SkillPackage;
    throw error;
  }
}

export async function login(
  config: Pick<TongtianluConfig, "apiBase">,
  username: string,
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (!config.apiBase) throw new Error("请先填写通天路 API 地址");
  if (!username || !password) throw new Error("请填写用户名和密码");
  const response = await fetchImpl(`${config.apiBase}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const body = await readBody(response);
  const token = body.data && typeof body.data === "object" ? stringField(body.data, "token") || stringField(body.data, "jwt") : "";
  if (!response.ok || !token) {
    throw new Error(errorMessage(body) || `登录失败（${response.status}）`);
  }
  return token;
}

export function paidUnlockMessage(): string {
  return "付费技能需要智能体 key（以 ttag_ 开头）才能解锁。当前版本只提供入口和提示，暂未完成付费解锁。";
}

export function assertAgentKey(key: string): void {
  if (!key.startsWith("ttag_")) throw new Error("智能体 key 需要以 ttag_ 开头");
}

/** 付费解锁入口。没有 API 地址时只提示，不发请求。 */
export async function requestUnlock(
  opts: SkillClientOptions,
  skill: SkillSummary,
  agentKey: string,
): Promise<{ sent: boolean; message: string }> {
  assertAgentKey(agentKey);
  if (!opts.config.apiBase) return { sent: false, message: paidUnlockMessage() };
  const fetchImpl = opts.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `${opts.config.apiBase}/agent/skills/${encodeURIComponent(skill.slug)}/versions/${encodeURIComponent(skill.versionId)}/unlock`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(opts.config.jwt ? { authorization: `Bearer ${opts.config.jwt}` } : {}),
      },
      body: JSON.stringify({ key: agentKey }),
    },
  );
  const body = await readBody(response);
  if (!response.ok) throw new Error(errorMessage(body) || `解锁失败（${response.status}）`);
  return { sent: true, message: "解锁请求已提交" };
}

export function assertSafeSkillPath(filePath: string): void {
  if (!filePath || filePath.includes("\\") || filePath.startsWith("/") || filePath.includes("\0")) {
    throw new Error(`非法技能路径：${filePath}`);
  }
  const parts = filePath.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`非法技能路径：${filePath}`);
  }
  const ok =
    filePath === "SKILL.md" ||
    filePath.startsWith("assets/") ||
    filePath.startsWith("references/") ||
    filePath.startsWith("scripts/");
  if (!ok) throw new Error(`技能包路径不在允许目录内：${filePath}`);
}

export async function verifyPackage(pkg: SkillPackage): Promise<{ path: string; bytes: Uint8Array; sha256: string }[]> {
  if (pkg.files.length === 0) throw new Error("技能包没有任何文件，已拒绝安装");
  const verified = [];
  for (const file of pkg.files) {
    assertSafeSkillPath(file.path);
    const bytes = fileBytes(file);
    const actual = await sha256Hex(bytes);
    if (actual !== file.sha256.trim().toLowerCase()) {
      throw new Error(`校验失败，已拒绝安装：${file.path} 的 sha256 不符`);
    }
    verified.push({ path: file.path, bytes, sha256: actual });
  }
  return verified;
}

export async function installPackage(
  pkg: SkillPackage,
  write: (files: { path: string; bytes: Uint8Array; sha256: string }[]) => Promise<void>,
): Promise<void> {
  const files = await verifyPackage(pkg);
  await write(files);
}

async function fetchSkillList(opts: SkillClientOptions): Promise<SkillSummary[]> {
  const body = await apiGet(opts, "/api/v1/skills");
  const rows = Array.isArray(body.data) ? body.data : [];
  const skills: SkillSummary[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const slug = stringField(record, "slug");
    if (!slug) continue;
    const detail = await apiGet(opts, `/api/v1/skills/${encodeURIComponent(slug)}`);
    const skill = detail.data && typeof detail.data === "object" ? (detail.data as Record<string, unknown>) : record;
    const version = latestApproved(skill);
    skills.push({
      slug,
      name: stringField(skill, "name") || stringField(record, "name") || slug,
      summary: stringField(skill, "summary") || stringField(skill, "description") || stringField(record, "summary") || "",
      version: version.version,
      versionId: version.id,
      pricing: stringField(skill, "pricing") === "paid" || stringField(record, "pricing") === "paid" ? "paid" : "free",
    });
  }
  return skills;
}

async function fetchRemotePackage(skill: SkillSummary, opts: SkillClientOptions): Promise<SkillPackage> {
  const body = await apiGet(
    opts,
    `/api/v1/skills/${encodeURIComponent(skill.slug)}/versions/${encodeURIComponent(skill.versionId)}/package`,
  );
  const data = body.data && typeof body.data === "object" ? (body.data as Record<string, unknown>) : {};
  const filesRaw = Array.isArray(data.files) ? data.files : [];
  const files: SkillFile[] = filesRaw.map((file) => {
    const record = file as Record<string, unknown>;
    return {
      path: stringField(record, "path"),
      sha256: stringField(record, "sha256"),
      text: typeof record.text === "string" ? record.text : undefined,
      contentBase64: typeof record.contentBase64 === "string" ? record.contentBase64 : undefined,
    };
  });
  return { slug: skill.slug, versionId: skill.versionId, version: skill.version, files };
}

function latestApproved(skill: Record<string, unknown>): { id: string; version: string } {
  const versions = Array.isArray(skill.versions) ? skill.versions : [];
  const approved = versions
    .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>) : null))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .filter((item) => stringField(item, "status") === "approved");
  const picked = approved[approved.length - 1];
  if (!picked) throw new Error(`技能 ${stringField(skill, "slug") || ""} 没有过审版本`);
  return {
    id: stringField(picked, "id"),
    version: stringField(picked, "version") || "0.0.0",
  };
}

async function apiGet(opts: SkillClientOptions, path: string): Promise<{ data?: unknown; error?: { code?: string; message?: string } }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const response = await fetchImpl(`${opts.config.apiBase}${path}`, {
    headers: { accept: "application/json", authorization: `Bearer ${opts.config.jwt}` },
  });
  const body = await readBody(response);
  if (!response.ok) throw new Error(errorMessage(body) || `通天路接口失败（${response.status}）`);
  return body;
}

async function readBody(response: Response): Promise<{ data?: unknown; error?: { code?: string; message?: string } }> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as { data?: unknown; error?: { code?: string; message?: string } };
  } catch {
    throw new Error(`通天路接口返回了无法解析的内容（${response.status}）`);
  }
}

function errorMessage(body: { error?: { code?: string; message?: string } }): string {
  return body.error?.message?.trim() || "";
}

function stringField(record: object, key: string): string {
  const value = (record as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function readCachedList(cache: KvCache): SkillSummary[] | null {
  const raw = cache.get("skills:list");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SkillSummary[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function fileBytes(file: SkillFile): Uint8Array {
  if (typeof file.text === "string") return new TextEncoder().encode(file.text);
  if (typeof file.contentBase64 === "string") return base64ToBytes(file.contentBase64);
  throw new Error(`${file.path} 缺少文件内容`);
}

function base64ToBytes(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeBase64Url(value: string): string {
  const pad = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = pad + "=".repeat((4 - (pad.length % 4)) % 4);
  return atob(padded);
}
