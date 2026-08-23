import { pageToMarkdown, type PageDoc } from "./json-to-markdown";

// Eagerly import every vendored landing JSON at build time.
const modules = import.meta.glob("../data/landing/*.json", { eager: true });

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
  pages.sort((a, b) => a.routeSlug.localeCompare(b.routeSlug));
  return pages;
}
