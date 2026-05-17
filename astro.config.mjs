import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://llms.contentcucumber.com",
  server: { port: 3021 },
  trailingSlash: "always",
  build: { format: "directory" },
});
