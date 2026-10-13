/** 与网站 /api/data/ratings.json 相同的评分结构。用户评价按纯文本保存和展示。 */

export interface RatingReview {
  stars: number;
  text: string;
  createdAt: string;
}

export interface AppRating {
  average: number;
  count: number;
  reviews: RatingReview[];
}

export function parseRatings(data: unknown): Map<string, AppRating> {
  if (!data || typeof data !== "object") return new Map();
  const apps = (data as { apps?: unknown }).apps;
  if (!apps || typeof apps !== "object") return new Map();
  const out = new Map<string, AppRating>();
  for (const [id, raw] of Object.entries(apps as Record<string, unknown>)) {
    const rating = normalizeRating(raw);
    if (rating) out.set(id.toLowerCase(), rating);
  }
  return out;
}

export function formatRating(rating: AppRating | undefined, t: (text: string) => string): string {
  if (!rating || rating.count < 1) return t("暂无评分");
  return `${rating.average.toFixed(1)} · ${rating.count} ${t("人评分")}`;
}

function normalizeRating(raw: unknown): AppRating | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as { average?: unknown; count?: unknown; reviews?: unknown };
  const { average, count } = record;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1) return null;
  if (typeof average !== "number" || !Number.isFinite(average) || average < 1 || average > 5) return null;
  const reviews = Array.isArray(record.reviews)
    ? record.reviews.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as { stars?: unknown; text?: unknown; createdAt?: unknown };
        if (typeof row.stars !== "number" || !Number.isInteger(row.stars) || row.stars < 1 || row.stars > 5) return [];
        if (typeof row.text !== "string" || !row.text.trim()) return [];
        return [{ stars: row.stars, text: row.text, createdAt: typeof row.createdAt === "string" ? row.createdAt : "" }];
      }).slice(0, 5)
    : [];
  return { average, count, reviews };
}
