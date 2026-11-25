// Bundles src/*.ts into dist/ and copies static/ (manifest, HTML, CSS) alongside.
import * as esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const watch = process.argv.includes("--watch");

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
cpSync("static", "dist", { recursive: true });

const options = {
  entryPoints: ["src/background.ts", "src/dashboard.ts", "src/options.ts", "src/sidepanel.ts"],
  outdir: "dist",
  bundle: true,
  format: "esm",
  target: "chrome120",
  minify: true,
  sourcemap: watch,
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("Watching src/ (static/ is copied only at start)…");
} else {
  await esbuild.build(options);
}
