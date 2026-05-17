import type { APIRoute } from "astro";
import { loadPages } from "../lib/pages";

const SITE = "https://llms.contentcucumber.com";

export const GET: APIRoute = () => {
  const urls = loadPages().map((p) => {
    const loc = p.routeSlug === "" ? `${SITE}/` : `${SITE}/${p.routeSlug}/`;
    return `  <url><loc>${loc}</loc></url>`;
  });
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join("\n") +
    "\n</urlset>\n";
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
