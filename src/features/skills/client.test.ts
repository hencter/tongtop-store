import { describe, expect, it } from "vitest";
import {
  assertAgentKey,
  assertSafeSkillPath,
  configFromEnv,
  getMockPackage,
  installPackage,
  jwtStatus,
  login,
  memoryCache,
  requestUnlock,
  syncSkills,
  verifyPackage,
  withBackoff,
  type SkillSummary,
} from "./client";

function jwt(exp: number): string {
  const payload = btoa(JSON.stringify({ exp })).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `eyJhbGciOiJub25lIn0.${payload}.sig`;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("credentials", () => {
  it("reads API base and JWT only from the provided env", () => {
    expect(configFromEnv({})).toEqual({ apiBase: "", jwt: "" });
    expect(configFromEnv({ TONGTIANLU_API_BASE: "https://api.example/", TONGTIANLU_JWT: " tok " })).toEqual({
      apiBase: "https://api.example",
      jwt: "tok",
    });
  });

  it("uses mock skills when credentials are missing and does not call the network", async () => {
    let called = 0;
    const result = await syncSkills({
      config: { apiBase: "", jwt: "" },
      fetchImpl: async () => {
        called += 1;
        return jsonResponse(500, {});
      },
    });
    expect(called).toBe(0);
    expect(result.source).toBe("mock");
    expect(result.skills.map((skill) => skill.slug)).toEqual([
      "tongtop-agent-access",
      "news-aggregator",
      "ttl-probe-skill",
    ]);
    expect(result.skills.find((skill) => skill.slug === "ttl-probe-skill")?.pricing).toBe("paid");
  });
});

describe("jwt", () => {
  it("explains that an expired token must be renewed within 7 days", () => {
    const status = jwtStatus(jwt(1), 10_000);
    expect(status.expired).toBe(true);
    expect(status.message).toContain("7 天");
    expect(status.message).toContain("重新登录");
  });

  it("accepts a token that has not expired", () => {
    expect(jwtStatus(jwt(4_000_000_000), 1_000).expired).toBe(false);
  });
});

describe("backoff and cache", () => {
  it("waits exponentially and then succeeds", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const value = await withBackoff(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error("temporary");
        return "ok";
      },
      { retries: 4, baseMs: 10, sleep: async (ms) => void sleeps.push(ms) },
    );
    expect(value).toBe("ok");
    expect(sleeps).toEqual([10, 20]);
  });

  it("falls back to the cached list after retries fail", async () => {
    const cache = memoryCache();
    const cached: SkillSummary[] = [
      { slug: "news-aggregator", name: "新闻聚合", summary: "cached", version: "1.2.0", versionId: "3", pricing: "free" },
    ];
    cache.set("skills:list", JSON.stringify(cached));
    const result = await syncSkills({
      config: { apiBase: "https://api.example", jwt: jwt(4_000_000_000) },
      cache,
      retries: 1,
      baseMs: 1,
      sleep: async () => {},
      now: () => 1_000,
      fetchImpl: async () => jsonResponse(503, { error: { code: "unavailable", message: "忙" } }),
    });
    expect(result.source).toBe("cache");
    expect(result.skills[0]?.slug).toBe("news-aggregator");
    expect(result.warning).toContain("忙");
  });
});

describe("remote sync", () => {
  it("follows the list, detail, and package endpoints", async () => {
    const seen: string[] = [];
    const skills = await syncSkills({
      config: { apiBase: "https://api.example", jwt: jwt(4_000_000_000) },
      now: () => 1_000,
      fetchImpl: async (input) => {
        const url = String(input);
        seen.push(url);
        if (url.endsWith("/api/v1/skills")) {
          return jsonResponse(200, { data: [{ slug: "news-aggregator" }], meta: { total: 1 } });
        }
        return jsonResponse(200, {
          data: {
            slug: "news-aggregator",
            name: "新闻聚合",
            summary: "远程简介",
            pricing: "free",
            versions: [
              { id: "old", version: "0.9.0", status: "rejected" },
              { id: "3", version: "1.2.0", status: "approved" },
            ],
          },
        });
      },
    });
    expect(seen).toEqual([
      "https://api.example/api/v1/skills",
      "https://api.example/api/v1/skills/news-aggregator",
    ]);
    expect(skills.skills[0]).toMatchObject({ version: "1.2.0", versionId: "3", summary: "远程简介" });
  });

  it("logs in with POST /api/v1/auth/login and returns the new token", async () => {
    const token = await login({ apiBase: "https://api.example" }, "ada", "secret", async (_input, init) => {
      expect(String(_input)).toBe("https://api.example/api/v1/auth/login");
      expect(init?.method).toBe("POST");
      return jsonResponse(200, { data: { token: "new.jwt.token" } });
    });
    expect(token).toBe("new.jwt.token");
  });
});

describe("sha256 install", () => {
  it("installs a mock package only after every file matches", async () => {
    const pkg = await getMockPackage("tongtop-agent-access");
    expect(pkg?.files.map((file) => file.path)).toEqual(["SKILL.md", "references/usage.md"]);
    const written: string[] = [];
    await installPackage(pkg!, async (files) => {
      written.push(...files.map((file) => file.path));
    });
    expect(written).toEqual(["SKILL.md", "references/usage.md"]);
  });

  it("refuses the install and does not write when a hash does not match", async () => {
    const pkg = await getMockPackage("news-aggregator");
    const broken = { ...pkg!, files: pkg!.files.map((file, index) => (index === 0 ? { ...file, text: `${file.text}x` } : file)) };
    let wrote = false;
    await expect(
      installPackage(broken, async () => {
        wrote = true;
      }),
    ).rejects.toThrow(/拒绝安装/);
    expect(wrote).toBe(false);
  });

  it("rejects path traversal before hashing", async () => {
    const pkg = await getMockPackage("news-aggregator");
    const evil = { ...pkg!, files: [{ path: "scripts/../../outside.txt", sha256: "abc", text: "no" }] };
    await expect(verifyPackage(evil)).rejects.toThrow(/非法技能路径/);
  });

  it("does not install a paid skill without an agent key", async () => {
    expect(() => assertAgentKey("nope")).toThrow(/ttag_/);
    const result = await requestUnlock(
      { config: { apiBase: "", jwt: "" } },
      { slug: "ttl-probe-skill", name: "通天路探测", summary: "", version: "0.3.0", versionId: "2", pricing: "paid" },
      "ttag_demo",
    );
    expect(result.sent).toBe(false);
    expect(result.message).toContain("ttag_");
  });
});

describe("paths", () => {
  it("allows the skill package layout", () => {
    expect(() => assertSafeSkillPath("SKILL.md")).not.toThrow();
    expect(() => assertSafeSkillPath("assets/icon.png")).not.toThrow();
    expect(() => assertSafeSkillPath("references/usage.md")).not.toThrow();
    expect(() => assertSafeSkillPath("scripts/sources.txt")).not.toThrow();
    expect(() => assertSafeSkillPath("README.md")).toThrow(/允许目录/);
  });
});
