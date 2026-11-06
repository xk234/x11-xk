import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart({
      spa: {
        enabled: true,
        // Cloudflare Pages canonicalizes *.html to extensionless URLs.
        // Put the SPA shell at /index.html to avoid the /_shell.html loop.
        prerender: {
          outputPath: "index.html",
        },
      },
    }),
    viteReact(),
  ],
});
