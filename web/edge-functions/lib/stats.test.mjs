import assert from "node:assert/strict";
import test from "node:test";
import { applyStat, emptyStats, normalizeStat, publicStats, STATS_WINDOW_MS } from "./stats.js";

const client = "11111111-1111-4111-8111-111111111111";

test("accepts an anonymous install report and rejects identity-shaped fields", () => {
  const ok = normalizeStat({ id: "Google.Chrome", version: "120.0", client, at: "2026-10-13T00:00:00.000Z" });
  assert.equal(ok.error, undefined);
  assert.equal(ok.value.version, "120.0");
  assert.equal(normalizeStat({ id: "../x", version: "1", client }).error, "应用 id 不正确");
  assert.match(normalizeStat({ id: "Google.Chrome", version: "1", client: "user@example.com" }).error, /客户端标识/);
});

test("counts the same client and app only once per 24 hours", () => {
  const first = applyStat(emptyStats(), { id: "Google.Chrome", client }, 1_000);
  assert.equal(first.counted, true);
  const second = applyStat(first.state, { id: "Google.Chrome", client }, 1_000 + STATS_WINDOW_MS - 1);
  assert.equal(second.counted, false);
  assert.equal(second.state.counts["Google.Chrome"], 1);
  const later = applyStat(second.state, { id: "Google.Chrome", client }, 1_000 + STATS_WINDOW_MS);
  assert.equal(later.counted, true);
  assert.equal(later.state.counts["Google.Chrome"], 2);
  const other = applyStat(later.state, { id: "Git.Git", client }, 1_000 + STATS_WINDOW_MS);
  assert.equal(other.counted, true);
});

test("public ranking is top 20 and contains no client id or version", () => {
  let state = emptyStats();
  for (let i = 0; i < 25; i += 1) {
    const id = `App.Item${String(i).padStart(2, "0")}`;
    for (let n = 0; n < i + 1; n += 1) {
      const result = applyStat(state, { id, client: `11111111-1111-4111-8111-${String(n).padStart(12, "0")}` }, 10_000 + n);
      state = result.state;
    }
  }
  const pub = publicStats(state, "2026-10-13T00:00:00.000Z");
  assert.equal(pub.top.length, 20);
  assert.equal(pub.top[0].id, "App.Item24");
  assert.equal(pub.top[0].count, 25);
  const text = JSON.stringify(pub);
  assert.equal(text.includes("11111111"), false);
  assert.equal(text.includes("version"), false);
  assert.equal(text.includes("seen"), false);
});
