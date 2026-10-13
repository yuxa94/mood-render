import { build } from "esbuild";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
await mkdir("dist", { recursive: true });
async function files(dir) {
  const all = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) all.push(...(await files(p)));
    else if (p.endsWith(".ts")) all.push(p);
  }
  return all;
}
await build({
  entryPoints: await files("src"),
  outdir: "dist/lib",
  outbase: "src",
  platform: "node",
  format: "esm",
  target: "node22",
  bundle: false,
});
try {
  await readFile("src/server/main.ts");
  await build({
    entryPoints: ["src/server/main.ts"],
    outfile: "dist/server.mjs",
    platform: "node",
    format: "esm",
    target: "node22",
    bundle: true,
    banner: {
      js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
  });
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
try {
  let html = await readFile("src/ui/index.html", "utf8");
  const js = await build({
    entryPoints: ["src/ui/main.ts"],
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    target: "es2022",
  });
  html = html.replace("/* APP_SCRIPT */", () =>
    js.outputFiles[0].text.replace(/<\/script/gi, "<\\/script"),
  );
  html = html.replace(
    "/* APP_STYLE */",
    await readFile("src/ui/styles.css", "utf8"),
  );
  await writeFile("dist/app.html", html);
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
