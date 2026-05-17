import type { APIRoute } from "astro";
import { loadPages } from "../lib/pages";

const SITE = "https://llms.contentcucumber.com";

export const GET: APIRoute = () => {
  const pages = loadPages();

  const lines: string[] = [];
  lines.push("# Content Cucumber");
  lines.push("");
  lines.push(
    "> Content Cucumber is a human-powered content marketing company (founded 2018). " +
      "We build authority for brands through content creation, SEO, AEO, and LLM " +
      "discovery — written by 40+ human writers, not AI. This is the AI-readable " +
      "mirror of contentcucumber.com: every page is available here as clean " +
      "Markdown for accurate citation."
  );
  lines.push("");
  lines.push(
    "Each link below points to the clean Markdown version of a page. The " +
      "canonical human page is on https://contentcucumber.com."
  );
  lines.push("");

  // Group: surface key commercial pages first, then everything else.
  const priority = [
    "",
    "about-us",
    "our-story",
    "pricing",
    "content-creation",
    "content-strategy",
    "seo",
    "seo-content",
    "ai-search",
    "ai-solutions",
    "aeo-optimization",
    "llm-discovery",
    "we-write-case-studies",
    "blog-writing",
    "website-copy",
  ];

  const bySlug = new Map(pages.map((p) => [p.routeSlug, p]));
  const seen = new Set<string>();

  lines.push("## Core Pages & Services");
  lines.push("");
  for (const slug of priority) {
    const p = bySlug.get(slug);
    if (!p) continue;
    seen.add(slug);
    const md = slug === "" ? "/index.md" : `/${slug}.md`;
    lines.push(`- [${p.title}](${SITE}${md})${p.description ? `: ${p.description}` : ""}`);
  }
  lines.push("");

  lines.push("## All Pages");
  lines.push("");
  for (const p of pages) {
    if (seen.has(p.routeSlug)) continue;
    const md = p.routeSlug === "" ? "/index.md" : `/${p.routeSlug}.md`;
    lines.push(`- [${p.title}](${SITE}${md})${p.description ? `: ${p.description}` : ""}`);
  }
  lines.push("");

  lines.push("## Contact");
  lines.push("");
  lines.push("- Website: https://contentcucumber.com");
  lines.push("- This mirror: https://llms.contentcucumber.com");
  lines.push("");

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
