import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const notices = [];
async function licenses(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const p = path.join(dir, entry.name);
    if (entry.name.startsWith("@")) {
      await licenses(p);
      continue;
    }
    try {
      const meta = JSON.parse(
        await readFile(path.join(p, "package.json"), "utf8"),
      );
      const names = (await readdir(p)).filter((n) =>
        /^(license|copying)(\.|$)/i.test(n),
      );
      for (const name of names)
        notices.push(
          `${meta.name} ${meta.version}\n${await readFile(path.join(p, name), "utf8")}`,
        );
    } catch {}
  }
}
await licenses("node_modules");
await writeFile(
  "THIRD_PARTY_NOTICES.txt",
  notices.join("\n\n========================================\n\n"),
);
const temp = await mkdtemp(path.join(tmpdir(), "mood-package-"));
const destination = path.join(temp, "mood-render");
await mkdir(destination);
try {
  for (const name of [
    "plugin.json",
    "mcp.json",
    ".mcp.json",
    ".codex-plugin",
    "assets",
    "skills",
    "dist",
    "src",
    "scripts",
    "tests",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "README.md",
    "Start.command",
    "THIRD_PARTY_NOTICES.txt",
  ]) {
    await cp(name, path.join(destination, name), { recursive: true });
  }
  await mkdir("releases", { recursive: true });
  const zip = path.resolve("releases", `mood-render-${pkg.version}.zip`);
  await rm(zip, { force: true });
  execFileSync("/usr/bin/ditto", [
    "-c",
    "-k",
    "--keepParent",
    destination,
    zip,
  ]);
  console.log(zip);
} finally {
  await rm(temp, { recursive: true, force: true });
}
