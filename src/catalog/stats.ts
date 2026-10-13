/** 匿名安装统计。关闭分享时不产生网络请求，也不生成客户端标识。 */

export const STATS_WINDOW_MS = 24 * 60 * 60 * 1000;
const CLIENT_KEY = "tongtop.client";
const HITS_KEY = "tongtop.statHits";

export interface StatStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface StatEvent {
  id: string;
  version: string;
  client: string;
  at: string;
}

export function topIds(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const top = (data as { top?: unknown }).top;
  if (!Array.isArray(top)) return [];
  return top
    .filter((item): item is { id: string } => Boolean(item) && typeof (item as { id?: unknown }).id === "string")
    .map((item) => item.id)
    .slice(0, 20);
}

export async function reportInstall(opts: {
  share: boolean;
  appId: string;
  version: string;
  now?: number;
  storage: StatStorage;
  post?: (event: StatEvent) => Promise<void>;
}): Promise<"off" | "deduped" | "sent" | "failed"> {
  if (!opts.share || !opts.post) return "off";
  const now = opts.now ?? Date.now();
  const hits = readHits(opts.storage);
  const previous = hits[opts.appId];
  if (typeof previous === "number" && now - previous < STATS_WINDOW_MS) return "deduped";
  const event: StatEvent = {
    id: opts.appId,
    version: opts.version.slice(0, 64),
    client: clientId(opts.storage),
    at: new Date(now).toISOString(),
  };
  try {
    await opts.post?.(event);
    hits[opts.appId] = now;
    opts.storage.setItem(HITS_KEY, JSON.stringify(hits));
    return "sent";
  } catch {
    return "failed";
  }
}

function clientId(storage: StatStorage): string {
  const existing = storage.getItem(CLIENT_KEY);
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
  const created = crypto.randomUUID();
  storage.setItem(CLIENT_KEY, created);
  return created;
}

function readHits(storage: StatStorage): Record<string, number> {
  try {
    const parsed = JSON.parse(storage.getItem(HITS_KEY) ?? "{}") as Record<string, number>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
