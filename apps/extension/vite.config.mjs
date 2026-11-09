import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  publicDir: "public",
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    lib: {
      entry: resolve(import.meta.dirname, "src/index.tsx"),
      formats: ["iife"],
      name: "AnchorRead",
      fileName: () => "content.js",
    },
  },
});
