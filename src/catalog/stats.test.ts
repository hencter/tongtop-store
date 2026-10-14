import { describe, expect, it, vi } from "vitest";
import { reportInstall, STATS_WINDOW_MS, topIds } from "./stats";

function memory() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

describe("reportInstall", () => {
  it("sends nothing and stores nothing when sharing is off", async () => {
    const storage = memory();
    const post = vi.fn();
    const result = await reportInstall({ share: false, appId: "Google.Chrome", version: "1", storage, post });
    expect(result).toBe("off");
    expect(post).not.toHaveBeenCalled();
    expect(storage.getItem("tongtop.client")).toBeNull();
    expect(storage.getItem("tongtop.statHits")).toBeNull();
  });

  it("counts one install per app per 24 hours", async () => {
    const storage = memory();
    const sent: { id: string; version: string; client: string }[] = [];
    const post = vi.fn(async (event: { id: string; version: string; client: string }) => {
      sent.push(event);
    });
    const first = await reportInstall({
      share: true,
      appId: "Google.Chrome",
      version: "120",
      now: 1_000,
      storage,
      post,
    });
    const second = await reportInstall({
      share: true,
      appId: "Google.Chrome",
      version: "120",
      now: 1_000 + STATS_WINDOW_MS - 1,
      storage,
      post,
    });
    expect(first).toBe("sent");
    expect(second).toBe("deduped");
    expect(post).toHaveBeenCalledTimes(1);
    expect(sent[0]?.id).toBe("Google.Chrome");
    expect(sent[0]?.version).toBe("120");
    expect(sent[0]?.client).toMatch(/^[0-9a-f-]{36}$/i);
    expect(JSON.stringify(sent[0])).not.toMatch(/name|email|account/i);
  });

  it("does not remember a hit when the request fails", async () => {
    const storage = memory();
    const post = vi.fn(async () => {
      throw new Error("offline");
    });
    const result = await reportInstall({ share: true, appId: "Git.Git", version: "2", storage, post });
    expect(result).toBe("failed");
    expect(storage.getItem("tongtop.statHits")).toBeNull();
  });
});

describe("topIds", () => {
  it("reads at most 20 ids and treats bad payloads as an empty ranking", () => {
    expect(topIds(null)).toEqual([]);
    expect(topIds({ top: "nope" })).toEqual([]);
    const top = Array.from({ length: 25 }, (_, index) => ({ id: `App.Item${index}`, count: index }));
    expect(topIds({ top })).toHaveLength(20);
  });
});
