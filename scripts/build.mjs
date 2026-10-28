// Builds the extension into dist/.
// background + popup are ES modules (allowed in MV3); content + inpage must be
// single self-contained IIFE files because Chrome cannot load content scripts as modules.
import { build } from "vite";
import { rm } from "fs/promises";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const watch = process.argv.includes("--watch");
const mode = watch ? "development" : "production";

await rm(resolve(root, "dist"), { recursive: true, force: true });

await build({
  root,
  mode,
  configFile: resolve(root, "vite.config.ts"),
  build: { watch: watch ? {} : null },
});

for (const name of ["content", "inpage"]) {
  await build({
    root,
    mode,
    configFile: false,
    publicDir: false,
    define: { "process.env.NODE_ENV": JSON.stringify(mode) },
    build: {
      outDir: "dist",
      emptyOutDir: false,
      watch: watch ? {} : null,
      lib: {
        entry: resolve(root, `src/${name}/index.ts`),
        name: `mywallet_${name}`,
        formats: ["iife"],
        fileName: () => `${name}.js`,
      },
    },
  });
}
