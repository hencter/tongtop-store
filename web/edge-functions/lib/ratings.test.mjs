import assert from "node:assert/strict";
import test from "node:test";
import { aggregateRatings, validateRating } from "./ratings.js";
import { rateLimited, validate } from "./submissions.js";

test("rating submission accepts 1-5 stars and a short plain-text review", () => {
  const result = validate({
    type: "rating",
    name: "Chrome",
    refId: "Google.Chrome",
    stars: 5,
    desc: "启动快，<script>alert(1)</script>",
  });
  assert.equal(result.error, undefined);
  assert.equal(result.value.type, "rating");
  assert.equal(result.value.stars, 5);
  assert.equal(result.value.desc, "启动快，<script>alert(1)</script>");
  assert.equal(result.value.contact, "");
});

test("rating submission rejects bad scores, empty text, overlong text, and bad ids", () => {
  assert.match(validateRating({ type: "rating", refId: "Google.Chrome", stars: 0, desc: "好" }).error, /1 到 5/);
  assert.match(validateRating({ type: "rating", refId: "Google.Chrome", stars: 6, desc: "好" }).error, /1 到 5/);
  assert.match(validateRating({ type: "rating", refId: "Google.Chrome", stars: 1.5, desc: "好" }).error, /1 到 5/);
  assert.match(validateRating({ type: "rating", refId: "Google.Chrome", stars: 4, desc: "  " }).error, /简短评价/);
  assert.match(validateRating({ type: "rating", refId: "Google.Chrome", stars: 4, desc: "字".repeat(281) }).error, /280/);
  assert.match(validateRating({ type: "rating", refId: "../etc", stars: 4, desc: "好" }).error, /应用 ID/);
  assert.equal(validate({ type: "app", name: "A", desc: "说明" }).error, undefined);
});

test("comment closer in the review text cannot break the stored marker", () => {
  const result = validateRating({
    type: "rating",
    refId: "Git.Git",
    stars: "3",
    desc: "看起来不错 --> <b>不该执行</b>",
  });
  assert.equal(result.value.stars, 3);
  assert.equal(result.value.desc.includes("-->"), false);
});

test("aggregate keeps only approved ratings and publishes at most five recent reviews", () => {
  const data = aggregateRatings(
    [
      { type: "rating", status: "pending", refId: "Google.Chrome", stars: 1, desc: "还不能公开", createdAt: "2026-10-01T00:00:00.000Z" },
      { type: "rating", status: "rejected", refId: "Google.Chrome", stars: 1, desc: "已拒绝", createdAt: "2026-10-02T00:00:00.000Z" },
      { type: "app", status: "approved", refId: "Google.Chrome", stars: 5, desc: "这是投稿不是评分", createdAt: "2026-10-03T00:00:00.000Z" },
      { type: "rating", status: "approved", refId: "Google.Chrome", stars: 5, desc: "很快", createdAt: "2026-10-04T00:00:00.000Z" },
      { type: "rating", status: "approved", refId: "Google.Chrome", stars: 4, desc: "稳定", createdAt: "2026-10-05T00:00:00.000Z" },
      { type: "rating", status: "approved", refId: "Git.Git", stars: 2, desc: "一般", createdAt: "2026-10-01T00:00:00.000Z" },
    ],
    "2026-10-13T00:00:00.000Z",
  );
  assert.equal(data.updatedAt, "2026-10-13T00:00:00.000Z");
  assert.equal(data.apps["Google.Chrome"].count, 2);
  assert.equal(data.apps["Google.Chrome"].average, 4.5);
  assert.deepEqual(
    data.apps["Google.Chrome"].reviews.map((review) => review.text),
    ["稳定", "很快"],
  );
  assert.equal(data.apps["Git.Git"].count, 1);
  assert.equal(JSON.stringify(data).includes("还不能公开"), false);
  assert.equal(JSON.stringify(data).includes("已拒绝"), false);
});

test("more than five approved reviews keep the newest five", () => {
  const records = Array.from({ length: 6 }, (_, index) => ({
    type: "rating",
    status: "approved",
    refId: "VideoLAN.VLC",
    stars: 5,
    desc: `第${index}条`,
    createdAt: `2026-10-0${index + 1}T00:00:00.000Z`,
  }));
  const data = aggregateRatings(records, "2026-10-13T00:00:00.000Z");
  assert.equal(data.apps["VideoLAN.VLC"].count, 6);
  assert.equal(data.apps["VideoLAN.VLC"].reviews.length, 5);
  assert.equal(data.apps["VideoLAN.VLC"].reviews[0].text, "第5条");
  assert.equal(data.apps["VideoLAN.VLC"].reviews.some((review) => review.text === "第0条"), false);
});

test("rating posts are rate limited separately from other submissions", () => {
  const ip = `rating-test-${Date.now()}-${Math.random()}`;
  assert.equal(rateLimited(ip, 3, 60_000), false);
  assert.equal(rateLimited(ip, 3, 60_000), false);
  assert.equal(rateLimited(ip, 3, 60_000), false);
  assert.equal(rateLimited(ip, 3, 60_000), true);
});
