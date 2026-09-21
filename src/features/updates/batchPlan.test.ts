/** issue #23 回归测试：批量更新范围 = 界面确认清单 = 底层执行任务。
 *  核心断言：被忽略 / 被取消勾选的软件绝不会进入执行清单。 */

import { describe, expect, it } from "vitest";
import { planBatch, splitByIgnore } from "./batchPlan";
import type { UpgradeInfo } from "../../ipc/types";

const u = (id: string, version = "1.0", available = "2.0"): UpgradeInfo => ({
  name: id,
  id,
  version,
  available,
});

describe("splitByIgnore", () => {
  it("永久忽略（*）与精确版本忽略均隐藏，其余可见", () => {
    const list = [u("A.a"), u("B.b"), u("C.c")];
    const { visible, hidden } = splitByIgnore(list, {
      "a.a": "*",
      "b.b": "2.0", // 命中当前可用版本
    });
    expect(visible.map((x) => x.id)).toEqual(["C.c"]);
    expect(hidden.map((x) => x.id)).toEqual(["A.a", "B.b"]);
  });

  it("版本忽略不命中新版本时重新可见", () => {
    const { visible, hidden } = splitByIgnore([u("B.b", "1.0", "3.0")], { "b.b": "2.0" });
    expect(visible).toHaveLength(1);
    expect(hidden).toHaveLength(0);
  });
});

describe("planBatch（issue #23 验收：忽略 1 项 + 更新其余 N 项）", () => {
  it("被忽略的软件不在执行清单中", () => {
    const list = [u("A.a"), u("B.b"), u("C.c"), u("D.d")];
    const { visible } = splitByIgnore(list, { "a.a": "*" });
    const batch = planBatch(visible, new Set());
    expect(batch.map((x) => x.id)).toEqual(["B.b", "C.c", "D.d"]);
    expect(batch.some((x) => x.id.toLowerCase() === "a.a")).toBe(false);
  });

  it("取消勾选的软件不在执行清单中，顺序与界面一致", () => {
    const visible = [u("A.a"), u("B.b"), u("C.c")];
    const batch = planBatch(visible, new Set(["b.b"]));
    expect(batch.map((x) => x.id)).toEqual(["A.a", "C.c"]);
  });

  it("id 大小写不敏感", () => {
    const batch = planBatch([u("Foo.Bar")], new Set(["foo.bar"]));
    expect(batch).toHaveLength(0);
  });
});
