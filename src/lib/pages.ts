import { pageToMarkdown, researchToMarkdown, type PageDoc } from "./json-to-markdown";

// Eagerly import every vendored landing JSON at build time.
const modules = import.meta.glob("../data/landing/*.json", { eager: true });

// Research library items (cc_research), vendored from the seed JSON the
// WordPress importer reads. Synced by `sync-landing-data.py --set research`.
const research = import.meta.glob("../data/research/*.json", { eager: true });

export interface LoadedPage extends PageDoc {
  /** Path segment used by Astro routing. "" === site root. */
  routeSlug: string;
}

function fileToSlug(path: string): string {
  const base = path.split("/").pop()!.replace(/\.json$/, "");
  return base === "homepage" ? "" : base;
}

function isNoindex(v: unknown): boolean {
  if (typeof v === "string") {
    return !["", "false", "0", "no"].includes(v.trim().toLowerCase());
  }
  return Boolean(v);
}

export function loadPages(): LoadedPage[] {
  const pages: LoadedPage[] = [];
  for (const [path, mod] of Object.entries(modules)) {
    const raw: any = (mod as any).default ?? mod;
    // Skip thank-you / popup / non-discovery pages. The canonical CC landing
    // data carries this flag at the top level OR nested under `seo.noindex`;
    // honor both so noindex pages never leak into the public AI mirror.
    // A JSON "false" is a STRING and every string except "" is truthy in JS,
    // so pages whose data said noindex:false were silently dropped from the
    // mirror -- including /content-refresh-at-scale/, a live offer. Same bug
    // bit the PHP template, where it also shipped a real noindex meta tag to
    // production. Normalise before believing it. Found 2026-08-23.
    if (isNoindex(raw?.noindex) || isNoindex(raw?.seo?.noindex)) continue;
    const slug = fileToSlug(path);
    const doc = pageToMarkdown(raw, slug);
    pages.push({ ...doc, routeSlug: slug });
  }
  // Research items. A landing page with the same slug wins: the eight
  // original reports and tools already have a fuller landing twin here.
  const taken = new Set(pages.map((p) => p.routeSlug));
  for (const mod of Object.values(research)) {
    const raw: any = (mod as any).default ?? mod;
    if (!raw?.slug || taken.has(raw.slug)) continue;
    if (raw.status && raw.status !== "publish") continue;
    const doc = researchToMarkdown(raw);
    pages.push({ ...doc, routeSlug: raw.slug });
  }
  pages.sort((a, b) => a.routeSlug.localeCompare(b.routeSlug));
  return pages;
}
