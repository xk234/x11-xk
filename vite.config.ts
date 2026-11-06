import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const isLovableSandbox = process.env.LOVABLE_SANDBOX === "1" || !!process.env.DEV_SERVER__PROJECT_PATH;

export default defineConfig({
  // Static-only output outside the Lovable preview environment.
  ...(isLovableSandbox ? {} : { nitro: false }),
  tanstackStart: {
    spa: { enabled: true },
  },
});