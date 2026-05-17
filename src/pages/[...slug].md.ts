import type { APIRoute } from "astro";
import { loadPages } from "../lib/pages";

export function getStaticPaths() {
  return loadPages()
    .filter((p) => p.routeSlug !== "")
    .map((p) => ({ params: { slug: p.routeSlug }, props: { md: p.markdown } }));
}

export const GET: APIRoute = ({ props }) =>
  new Response((props as { md: string }).md, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
