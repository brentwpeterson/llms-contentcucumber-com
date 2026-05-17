import type { APIRoute } from "astro";
import { loadPages } from "../lib/pages";

const SITE = "https://llms.contentcucumber.com";
const CANONICAL = "https://contentcucumber.com";

/**
 * /llms-full.txt — every page's clean Markdown concatenated into one file
 * (the Answer.AI llms-full convention). Lets an AI crawler ingest the whole
 * site in a single fetch instead of walking 92 per-page .md files. The
 * curated index lives at /llms.txt; this is the full-text companion.
 */
export const GET: APIRoute = () => {
  const pages = loadPages();

  const out: string[] = [];
  out.push("# Content Cucumber — Full Content");
  out.push("");
  out.push(
    "> Content Cucumber is a human-powered content marketing company " +
      "(founded 2018). We build authority for brands through content " +
      "creation, SEO, AEO, and LLM discovery — written by 40+ human writers, " +
      "not AI. This file is the complete machine-readable text of every page " +
      "on the AI-readable mirror of contentcucumber.com, concatenated for " +
      "single-fetch ingestion."
  );
  out.push("");
  out.push(
    `Curated index: ${SITE}/llms.txt — Canonical human site: ${CANONICAL}`
  );
  out.push("");

  for (const p of pages) {
    const htmlUrl =
      p.routeSlug === "" ? `${SITE}/` : `${SITE}/${p.routeSlug}/`;
    const mdUrl =
      p.routeSlug === "" ? `${SITE}/index.md` : `${SITE}/${p.routeSlug}.md`;
    out.push("");
    out.push("---");
    out.push("");
    out.push(`Source: ${htmlUrl} (Markdown: ${mdUrl})`);
    out.push("");
    out.push(p.markdown.trim());
    out.push("");
  }

  return new Response(out.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
