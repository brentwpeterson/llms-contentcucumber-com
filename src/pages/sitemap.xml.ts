import type { APIRoute } from "astro";
import { loadPages } from "../lib/pages";

const SITE = "https://llms.contentcucumber.com";

export const GET: APIRoute = () => {
  const locs: string[] = [];

  for (const p of loadPages()) {
    if (p.routeSlug === "") {
      // Site root: HTML at /, Markdown twin at /index.md
      locs.push(`${SITE}/`);
      locs.push(`${SITE}/index.md`);
    } else {
      // HTML at /slug/, Markdown twin at /slug.md
      locs.push(`${SITE}/${p.routeSlug}/`);
      locs.push(`${SITE}/${p.routeSlug}.md`);
    }
  }

  // Machine-readable discovery files (so a sitemap-only crawler finds them).
  locs.push(`${SITE}/llms.txt`);
  locs.push(`${SITE}/llms-full.txt`);
  locs.push(`${SITE}/robots.txt`);

  const urls = locs.map((loc) => `  <url><loc>${loc}</loc></url>`);
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join("\n") +
    "\n</urlset>\n";
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
