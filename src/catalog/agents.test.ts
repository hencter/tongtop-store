/** 排序铁律回归测试：任何闭源智能体都不得排在开源智能体之前。 */

import { describe, expect, it } from "vitest";
import { AGENTS, isClosed, sortAgents, type ConcernTag } from "./agents";

const a = (id: string, concerns?: ConcernTag[]) => ({ id, concerns });

describe("sortAgents", () => {
  it("闭源沉底，组内保持原有相对顺序", () => {
    const list = [a("c1", ["closed"]), a("o1"), a("c2", ["closed", "data"]), a("o2", ["data"])];
    expect(sortAgents(list).map((x) => x.id)).toEqual(["o1", "o2", "c1", "c2"]);
  });

  it("不修改入参", () => {
    const list = [a("c1", ["closed"]), a("o1")];
    sortAgents(list);
    expect(list.map((x) => x.id)).toEqual(["c1", "o1"]);
  });

  it("内置目录满足排序铁律", () => {
    const firstClosed = AGENTS.findIndex(isClosed);
    expect(firstClosed).toBeGreaterThan(0);
    expect(AGENTS.slice(firstClosed).every(isClosed)).toBe(true);
  });
});
