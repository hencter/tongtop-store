/** issue #23 回归测试：批量更新范围 = 界面确认清单 = 底层执行任务。
 *  核心断言：被忽略 / 被取消勾选的软件绝不会进入执行清单。 */

import { describe, expect, it } from "vitest";
import { planBatch, queueItemState, splitByIgnore, upcomingPrefetchIds } from "./batchPlan";
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

describe("queueItemState", () => {
  const ids = ["A", "B", "C"];

  it("未开始时没有队列状态", () => {
    expect(queueItemState("A", ids, {}, 0, false)).toBeNull();
  });

  it("进行中：当前项 running，后面 pending，已完成看 results", () => {
    const results = { A: "success" as const };
    expect(queueItemState("A", ids, results, 1, true)).toBe("success");
    expect(queueItemState("B", ids, results, 1, true)).toBe("running");
    expect(queueItemState("C", ids, results, 1, true)).toBe("pending");
  });

  it("不在队列里的项没有状态", () => {
    expect(queueItemState("Z", ids, {}, 0, true)).toBeNull();
  });

  it("排队项：后台预取中显示 prefetching，下完显示 ready", () => {
    const prefetch = { B: "downloading" as const, C: "ready" as const };
    expect(queueItemState("B", ids, {}, 0, true, prefetch)).toBe("prefetching");
    expect(queueItemState("C", ids, {}, 0, true, prefetch)).toBe("ready");
    expect(queueItemState("A", ids, {}, 0, true, prefetch)).toBe("running");
  });

  it("预取失败仍显示 pending（安装时会自行下载）", () => {
    expect(queueItemState("B", ids, {}, 0, true, { B: "failed" })).toBe("pending");
  });

  it("预取 map 按小写 id 也能命中", () => {
    expect(queueItemState("Git.Git", ["A", "Git.Git"], {}, 0, true, { "git.git": "ready" })).toBe(
      "ready",
    );
  });
});

describe("upcomingPrefetchIds", () => {
  it("当前项之后最多取 LOOKAHEAD 个", () => {
    expect(upcomingPrefetchIds(["A", "B", "C", "D"], 0)).toEqual(["B", "C"]);
    expect(upcomingPrefetchIds(["A", "B", "C", "D"], 2)).toEqual(["D"]);
    expect(upcomingPrefetchIds(["A", "B"], 1)).toEqual([]);
    expect(upcomingPrefetchIds(["A"], 0)).toEqual([]);
  });

  it("越界索引得到空列表", () => {
    expect(upcomingPrefetchIds(["A"], -1)).toEqual([]);
    expect(upcomingPrefetchIds(["A"], 3)).toEqual([]);
  });
});
