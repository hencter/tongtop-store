import { describe, expect, it } from "vitest";
import { formatRating, parseRatings } from "./ratings";

const t = (text: string) => text;

describe("parseRatings", () => {
  it("returns an empty map when there are no ratings", () => {
    expect(parseRatings({ updatedAt: "", apps: {} }).size).toBe(0);
    expect(parseRatings(null).size).toBe(0);
    expect(formatRating(undefined, t)).toBe("暂无评分");
  });

  it("keeps review text unchanged so the UI can render it as plain text", () => {
    const text = `<img src=x onerror="alert(1)">`;
    const map = parseRatings({
      apps: {
        "Google.Chrome": {
          average: 4.5,
          count: 2,
          reviews: [{ stars: 5, text, createdAt: "2026-10-01T00:00:00.000Z" }],
        },
      },
    });
    const rating = map.get("google.chrome");
    expect(rating?.average).toBe(4.5);
    expect(rating?.count).toBe(2);
    expect(rating?.reviews[0].text).toBe(text);
    expect(formatRating(rating, t)).toBe("4.5 · 2 人评分");
  });

  it("drops malformed entries", () => {
    const map = parseRatings({
      apps: {
        "Git.Git": { average: 9, count: 1, reviews: [] },
        "VideoLAN.VLC": { average: 4, count: 1, reviews: [{ stars: 4, text: "清晰", createdAt: "" }] },
      },
    });
    expect(map.has("git.git")).toBe(false);
    expect(map.get("videolan.vlc")?.reviews[0].text).toBe("清晰");
  });
});
