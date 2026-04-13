import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import webExtension, { readJsonFile } from "vite-plugin-web-extension";

const browser = process.env.BROWSER ?? "chrome";

// Polyfills injected at the very top of the AudioWorklet bundle.
// AudioWorkletGlobalScope lacks URL, document, and WorkerGlobalScope,
// all of which the Emscripten-compiled RNNoise WASM loader requires.
const workletPolyfill = `
if(typeof globalThis.URL==="undefined"){globalThis.URL=class URL{constructor(u,b){this.href=b&&!u.includes("://")?b.replace(/[?#].*$/,"").replace(/\\/[^/]*$/,"/")+u:u;this.origin="";this.protocol="";this.pathname=this.href;this.search="";this.hash=""}toString(){return this.href}static createObjectURL(){return"blob:worklet"}static revokeObjectURL(){}}};
if(typeof document==="undefined"){globalThis.document={baseURI:"",currentScript:null}};
if(typeof WorkerGlobalScope==="undefined"){globalThis.WorkerGlobalScope=globalThis.constructor};
`;

function workletPolyfillPlugin(): Plugin {
  return {
    name: "worklet-polyfill",
    renderChunk(code, chunk) {
      if (chunk.fileName.includes("noise-processor")) {
        return workletPolyfill + code;
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    workletPolyfillPlugin(),
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
