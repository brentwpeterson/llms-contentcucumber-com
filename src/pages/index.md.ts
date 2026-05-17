import type { APIRoute } from "astro";
import { loadPages } from "../lib/pages";

export const GET: APIRoute = () => {
  const home = loadPages().find((p) => p.routeSlug === "");
  return new Response(home?.markdown ?? "# Content Cucumber\n", {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
};
