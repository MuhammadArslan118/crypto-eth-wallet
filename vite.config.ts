import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// content.js and inpage.js are built separately as IIFE bundles (see scripts/build.mjs).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: {
      input: {
        background: resolve(__dirname, "src/background/index.ts"),
        popup: resolve(__dirname, "src/popup/main.tsx"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name].[ext]",
      },
    },
  },
  publicDir: "public",
});
