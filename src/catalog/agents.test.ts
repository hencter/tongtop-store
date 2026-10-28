/** 排序铁律回归测试：任何闭源智能体都不得排在开源智能体之前。 */

import { describe, expect, it } from "vitest";
import { AGENTS, isClosed, sortAgents, type ConcernTag } from "./agents";

const a = (id: string, concerns?: ConcernTag[], rank?: number) => ({ id, concerns, rank });

describe("sortAgents", () => {
  it("闭源沉底；没有 rank 时组内保持原有相对顺序", () => {
    const list = [a("c1", ["closed"]), a("o1"), a("c2", ["closed", "data"]), a("o2", ["data"])];
    expect(sortAgents(list).map((x) => x.id)).toEqual(["o1", "o2", "c1", "c2"]);
  });

  it("同组内按 rank 升序，相同 rank 保持原顺序，闭源即使 rank 更高也沉底", () => {
    const list = [
      a("o-late", undefined, 2),
      a("o-first", undefined, 1),
      a("o-tie", undefined, 2),
      a("c-best", ["closed"], 1),
    ];
    expect(sortAgents(list).map((x) => x.id)).toEqual(["o-first", "o-late", "o-tie", "c-best"]);
  });

  it("不修改入参", () => {
    const list = [a("c1", ["closed"]), a("o1")];
    sortAgents(list);
    expect(list.map((x) => x.id)).toEqual(["c1", "o1"]);
  });

  it("内置目录满足排序铁律，且组内按 rank 升序", () => {
    const firstClosed = AGENTS.findIndex(isClosed);
    expect(firstClosed).toBeGreaterThan(0);
    expect(AGENTS.slice(firstClosed).every(isClosed)).toBe(true);

    const rankOf = (agent: (typeof AGENTS)[number]) => agent.rank ?? Number.MAX_SAFE_INTEGER;
    const openRanks = AGENTS.slice(0, firstClosed).map(rankOf);
    const closedRanks = AGENTS.slice(firstClosed).map(rankOf);
    expect(openRanks).toEqual([...openRanks].sort((x, y) => x - y));
    expect(closedRanks).toEqual([...closedRanks].sort((x, y) => x - y));
    expect(AGENTS.slice(0, 4).map((agent) => agent.id)).toEqual([
      "codex",
      "gemini",
      "ollama",
      "cherrystudio",
    ]);
    expect(firstClosed).toBe(13);
  });
});
