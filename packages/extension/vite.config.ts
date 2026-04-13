import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import webExtension, { readJsonFile } from "vite-plugin-web-extension";

const browser = process.env.BROWSER ?? "chrome";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    webExtension({
      browser,
      manifest: () => ({
        ...readJsonFile("src/manifest.base.json"),
        ...readJsonFile(`src/manifest.${browser}.json`),
      }),
      additionalInputs: [
        "src/worklet/noise-processor.ts",
      ],
    }),
  ],
  build: {
    outDir: browser === "chrome" ? "dist/chrome" : `dist/${browser}`,
    rollupOptions: {
      output: {
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
