// Bundles the extension into dist/extension.js (desktop) and dist/browser.js (web).
//   node esbuild.mjs               development build (source maps)
//   node esbuild.mjs --production  minified build used by `vsce package`
//   node esbuild.mjs --watch       rebuild on change
import * as esbuild from "esbuild";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

const shared = {
  bundle: true,
  format: "cjs",
  external: ["vscode"],
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  logLevel: "info",
};

const contexts = await Promise.all([
  esbuild.context({ ...shared, entryPoints: ["src/extension.ts"], platform: "node", target: "node18", outfile: "dist/extension.js" }),
  esbuild.context({ ...shared, entryPoints: ["src/browser.ts"], platform: "browser", target: "es2022", outfile: "dist/browser.js" }),
]);

if (watch) {
  await Promise.all(contexts.map((ctx) => ctx.watch()));
} else {
  for (const ctx of contexts) {
    await ctx.rebuild();
    await ctx.dispose();
  }
}
