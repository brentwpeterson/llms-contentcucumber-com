/**
 * Converts a Content Cucumber landing-page JSON file into clean Markdown
 * for AI crawlers / LLMs.
 *
 * The source JSON has two shape families:
 *   A) { seo, form, sections: [{ type, data, variant }] }
 *   B) { seo, hero, proof_bar, sections: [{ id, title, content[] }], faq, cta }
 *
 * For an LLM mirror we want content fidelity, not layout fidelity. This is a
 * recursive, field-aware extractor: known structured blocks (FAQ, stats,
 * comparison tables, steps) get explicit formatting; everything else flows
 * through a generic renderer that emits headings, paragraphs and lists.
 */

export interface PageDoc {
  slug: string;
  title: string;
  description: string;
  canonical: string;
  markdown: string;
}

const MAIN_SITE = "https://contentcucumber.com";

/** Normalized page H1, so the first section doesn't repeat the title. */
let pageH1 = "";
const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Strip HTML to clean text, preserving emphasis as Markdown. */
function htmlToText(input: unknown): string {
  if (input == null) return "";
  let s = String(input);
  s = s.replace(/<br\s*\/?>/gi, " ");
  s = s.replace(/<\/(p|div|li|h[1-6])>/gi, "\n");
  s = s.replace(/<(strong|b)>/gi, "**").replace(/<\/(strong|b)>/gi, "**");
  s = s.replace(/<(em|i)>/gi, "*").replace(/<\/(em|i)>/gi, "*");
  s = s.replace(/<a [^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, "[$2]($1)");
  s = s.replace(/<[^>]+>/g, "");
  const named: Record<string, string> = {
    amp: "&",
    nbsp: " ",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    rarr: "→",
    larr: "←",
    hellip: "…",
    mdash: "—",
    ndash: "–",
    rsquo: "’",
    lsquo: "‘",
    rdquo: "”",
    ldquo: "“",
    trade: "™",
    reg: "®",
    copy: "©",
    deg: "°",
    times: "×",
    check: "✓",
  };
  s = s.replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (m, name) => named[name] ?? m);
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_m, h) =>
    String.fromCodePoint(parseInt(h, 16))
  );
  s = s.replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(parseInt(d, 10)));
  // Any leftover unknown entity: drop it rather than leak raw markup.
  s = s.replace(/&[a-zA-Z0-9#]+;/g, "");
  s = s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function pushParagraphs(out: string[], v: unknown): void {
  for (const p of asArray(v as any)) {
    // A "paragraph" can be a structured block, not just a string
    // (e.g. a boxed callout: { boxed, sections: [{ label, text }] }).
    // Stringifying that yields "[object Object]" and silently drops the
    // content — render it instead.
    if (p && typeof p === "object") {
      const obj = p as any;
      if (Array.isArray(obj.sections)) {
        for (const s of obj.sections) {
          const label = htmlToText(s?.label || s?.title);
          const text = htmlToText(s?.text || s?.content || s?.description);
          if (label && text) out.push(`> **${label}** — ${text}`, "");
          else if (text) out.push(`> ${text}`, "");
          else if (label) out.push(`> **${label}**`, "");
        }
        continue;
      }
      // Unknown object shape: hand to the item renderer rather than
      // leaking "[object Object]".
      renderItems(out, [obj]);
      continue;
    }
    const t = htmlToText(p);
    if (t) out.push(t, "");
  }
}

/** Render a list of feature/item objects ({title,description} etc.). */
function renderItems(out: string[], items: any[]): void {
  for (const it of items) {
    if (it == null) continue;
    if (typeof it === "string") {
      const t = htmlToText(it);
      if (t) out.push(`- ${t}`);
      continue;
    }
    // FAQ pair
    if (it.question || it.answer) {
      const q = htmlToText(it.question);
      const a = htmlToText(it.answer);
      if (q) out.push(`### ${q}`, "");
      if (a) out.push(a, "");
      continue;
    }
    // stat / proof-bar entry
    if ((it.number || it.stat || it.value) && it.label) {
      out.push(`- **${htmlToText(it.number || it.stat || it.value)}** — ${htmlToText(it.label)}`);
      continue;
    }
    const heading = it.title || it.name || it.heading || it.label || it.eyebrow;
    const body =
      it.description || it.content || it.text || it.body || it.answer || it.paragraph;
    if (heading) out.push(`#### ${htmlToText(heading)}`, "");
    if (body) pushParagraphs(out, body);
    // nested features / bullets
    for (const key of ["features", "bullets", "points", "items", "list"]) {
      if (Array.isArray(it[key])) {
        for (const b of it[key]) {
          const t = htmlToText(typeof b === "string" ? b : b?.text || b?.title);
          if (t) out.push(`- ${t}`);
        }
        out.push("");
      }
    }
    if (it.price) out.push(`*Price: ${htmlToText(it.price)}*`, "");
  }
  if (out[out.length - 1] !== "") out.push("");
}

/** Render a comparison table block to a Markdown table when possible. */
function renderComparison(out: string[], data: any): void {
  const rows: any[] = data.rows || data.items || data.comparison || [];
  if (!Array.isArray(rows) || rows.length === 0) {
    renderGeneric(out, data);
    return;
  }
  const cols = data.columns || data.headers;
  if (Array.isArray(cols) && cols.length) {
    out.push(`| ${cols.map((c: any) => htmlToText(c.label || c)).join(" | ")} |`);
    out.push(`| ${cols.map(() => "---").join(" | ")} |`);
    for (const r of rows) {
      const cells = Array.isArray(r) ? r : r.cells || Object.values(r);
      out.push(`| ${cells.map((c: any) => htmlToText(c)).join(" | ")} |`);
    }
    out.push("");
  } else {
    renderItems(out, rows);
  }
}

/** Generic recursive renderer for any object/section data. */
function renderGeneric(out: string[], data: any): void {
  if (data == null) return;
  if (typeof data === "string") {
    pushParagraphs(out, data);
    return;
  }
  if (Array.isArray(data)) {
    renderItems(out, data);
    return;
  }
  const eyebrow = data.eyebrow ? htmlToText(data.eyebrow) : "";
  const title = data.title || data.heading || data.headline || data.name;
  const subtitle = data.subtitle || data.subheading || data.lede || data.intro;
  if (title && norm(htmlToText(title)) !== pageH1) {
    out.push(`## ${htmlToText(title)}${eyebrow ? ` (${eyebrow})` : ""}`, "");
  }
  if (subtitle) pushParagraphs(out, subtitle);
  pushParagraphs(out, data.paragraphs);
  pushParagraphs(out, data.content);
  pushParagraphs(out, data.text);
  pushParagraphs(out, data.body);
  pushParagraphs(out, data.answer);

  for (const key of [
    "items",
    "features",
    "steps",
    "cards",
    "services",
    "bundles",
    "challenges",
    "outcomes",
    "reviews",
    "testimonials",
    "stats",
    "list",
    "points",
    "columns",
  ]) {
    if (Array.isArray(data[key]) && data[key].length) {
      renderItems(out, data[key]);
    }
  }

  // CTA link
  const linkUrl = data.link_url || data.button_url || data.cta_url || data.url;
  const linkText = data.link_text || data.button_text || data.cta_text;
  if (linkUrl && linkText) {
    out.push(`[${htmlToText(linkText)}](${linkUrl})`, "");
  }
}

function renderSection(out: string[], type: string, data: any, variant?: string): void {
  switch (type) {
    case "faq": {
      out.push(`## ${htmlToText(data?.title) || "Frequently Asked Questions"}`, "");
      renderItems(out, data?.items || data?.questions || asArray(data));
      break;
    }
    case "proof-bar":
    case "proof_bar": {
      out.push("## By the Numbers", "");
      renderItems(out, asArray(data));
      break;
    }
    case "comparison-table":
    case "comparison-grid": {
      out.push(`## ${htmlToText(data?.title) || "Comparison"}`, "");
      renderComparison(out, data);
      break;
    }
    case "how-it-works": {
      out.push(`## ${htmlToText(data?.title) || "How It Works"}`, "");
      renderGeneric(out, data);
      break;
    }
    default:
      renderGeneric(out, data);
  }
}

export function pageToMarkdown(raw: any, slug: string): PageDoc {
  const seo = raw.seo || {};
  const title =
    htmlToText(seo.title) ||
    htmlToText(raw.hero?.title) ||
    htmlToText(raw.sections?.[0]?.data?.title) ||
    (slug === "" || slug === "homepage"
      ? "Content Cucumber — Human-Powered Content Marketing"
      : slug);
  pageH1 = norm(title);
  const description = htmlToText(seo.meta_description || seo.og_description || "");
  const canonicalPath = slug === "" || slug === "homepage" ? "/" : `/${slug}/`;
  const canonical = `${MAIN_SITE}${canonicalPath}`;

  const out: string[] = [];
  out.push(`# ${title}`, "");
  if (description) out.push(`> ${description}`, "");
  out.push(`*Source: [${canonical}](${canonical})*`, "");
  out.push("---", "");

  // Family B: top-level hero
  if (raw.hero) {
    const h = raw.hero;
    if (h.eyebrow) out.push(`**${htmlToText(h.eyebrow)}**`, "");
    if (h.subtitle) pushParagraphs(out, h.subtitle);
    pushParagraphs(out, h.paragraphs);
  }
  if (raw.proof_bar) renderSection(out, "proof-bar", raw.proof_bar);

  // sections[]
  for (const s of raw.sections || []) {
    if (s == null) continue;
    if (s.type) {
      renderSection(out, s.type, s.data ?? s, s.variant);
    } else if (s.title || s.content) {
      // typeless content block (Family B pillar pages)
      if (s.title) out.push(`## ${htmlToText(s.title)}`, "");
      pushParagraphs(out, s.content);
      if (s.link_url && s.link_text) {
        out.push(`[${htmlToText(s.link_text)}](${s.link_url})`, "");
      }
    } else {
      renderGeneric(out, s);
    }
  }

  // Family B trailing blocks
  if (raw.faq) renderSection(out, "faq", raw.faq);
  for (const ctaKey of ["cta", "bottom_cta"]) {
    if (raw[ctaKey]) {
      const c = raw[ctaKey];
      if (c.title || c.heading) out.push(`## ${htmlToText(c.title || c.heading)}`, "");
      pushParagraphs(out, c.paragraphs || c.text || c.subtitle);
    }
  }

  const markdown =
    out
      .join("\n")
      // Absolutize root-relative internal links so LLMs that follow them
      // land on real content on the canonical site, not a mirror 404.
      .replace(/\]\(\/(?!\/)/g, `](${MAIN_SITE}/`)
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n";

  return { slug, title, description, canonical, markdown };
}
