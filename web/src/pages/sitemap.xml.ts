/**
 * 站点地图：静态页 + 每个应用详情页。构建时预渲染为 /sitemap.xml。
 */
import type { APIRoute } from "astro";
import { APPS, SITE_ORIGIN, appCanonical } from "../lib/data";

export const prerender = true;

const STATIC_PATHS = ["/", "/apps", "/agents", "/mirrors", "/ai", "/community", "/download", "/submit", "/review"];

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const GET: APIRoute = () => {
  const locs = [...STATIC_PATHS.map((path) => `${SITE_ORIGIN}${path === "/" ? "/" : path}`), ...APPS.map((app) => appCanonical(app.id))];
  const body = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...locs.map((loc) => `  <url><loc>${escapeXml(loc)}</loc></url>`),
    `</urlset>`,
    ``,
  ].join("\n");
  return new Response(body, {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
};
