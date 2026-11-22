import { pageToMarkdown, researchToMarkdown, glossaryToMarkdown, type PageDoc } from "./json-to-markdown";

// Eagerly import every vendored landing JSON at build time.
const modules = import.meta.glob("../data/landing/*.json", { eager: true });

// Research library items (cc_research), vendored from the seed JSON the
// WordPress importer reads. Synced by `sync-landing-data.py --set research`.
const research = import.meta.glob("../data/research/*.json", { eager: true });

// AEO glossary terms (cc_glossary), one seed file per term. Synced by
// `sync-landing-data.py --set glossary`. Each renders at aeo-glossary/<slug>,
// under the hub page that comes from landing/aeo-glossary.json.
const glossary = import.meta.glob("../data/glossary/*.json", { eager: true });
const GLOSSARY_HUB = "aeo-glossary";

export interface LoadedPage extends PageDoc {
  /** Path segment used by Astro routing. "" === site root. */
  routeSlug: string;
}

const MIRROR_SITE = "https://llms.contentcucumber.com";

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
  // Glossary terms, only when the hub itself is public. The hub then lists
  // every term, because its landing JSON holds the intro and no definitions.
  const hub = pages.find((p) => p.routeSlug === GLOSSARY_HUB);
  if (hub) {
    const terms = Object.values(glossary)
      .map((mod) => (mod as any).default ?? mod)
      .filter((raw: any) => raw?.slug && (!raw.status || raw.status === "publish"))
      .sort((a: any, b: any) => String(a.title).localeCompare(String(b.title)));
    const titles = new Map<string, string>(terms.map((t: any) => [t.slug, t.title]));
    const index: string[] = ["## Terms", ""];
    for (const raw of terms) {
      const doc = glossaryToMarkdown(raw, titles);
      pages.push({ ...doc, routeSlug: `${GLOSSARY_HUB}/${raw.slug}` });
      index.push(`- [${doc.title}](${MIRROR_SITE}/${GLOSSARY_HUB}/${raw.slug}.md): ${doc.description}`);
    }
    if (terms.length) hub.markdown = hub.markdown.trimEnd() + "\n\n" + index.join("\n") + "\n";
  }
  pages.sort((a, b) => a.routeSlug.localeCompare(b.routeSlug));
  return pages;
}
