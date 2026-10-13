import { describe, expect, it } from "vitest";
import { CATALOG, sortByNewest } from "./apps";

describe("sortByNewest", () => {
  it("puts the latest addedAt first and keeps undated items in their original order at the end", () => {
    const items = [
      { id: "a" },
      { id: "b", addedAt: "2026-01-01" },
      { id: "c", addedAt: "2026-09-01" },
      { id: "d" },
    ];
    expect(sortByNewest(items, (item) => item.addedAt).map((item) => item.id)).toEqual(["c", "b", "a", "d"]);
    expect(items.map((item) => item.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("catalog metadata", () => {
  it("still loads legacy entries that omit the optional store fields", () => {
    const legacy = CATALOG.filter((app) => app.publisher === undefined);
    expect(legacy.length).toBeGreaterThan(0);
    expect(legacy.every((app) => app.id && app.name && app.site && app.category)).toBe(true);
  });

  it("fills publisher, license, pricing, screenshots and dates on at least 10 apps", () => {
    const filled = CATALOG.filter(
      (app) =>
        app.publisher &&
        app.license &&
        app.pricing &&
        (app.screenshots?.length ?? 0) > 0 &&
        app.addedAt &&
        app.updatedAt,
    );
    expect(filled.length).toBeGreaterThanOrEqual(10);
  });
});
