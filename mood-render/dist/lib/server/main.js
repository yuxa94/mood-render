import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./app.js";
import { Service } from "./service.js";
import { startPreview } from "./preview.js";
const root = process.env.MOOD_RENDER_DATA_ROOT || path.join(
  process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
  "mood-render",
  "projects"
);
const args = process.argv.slice(2);
const ci = args.indexOf("--call");
if (ci >= 0) {
  try {
    const fi = args.indexOf("--args-file");
    const input = fi >= 0 ? JSON.parse(await readFile(args[fi + 1], "utf8")) : {};
    console.log(
      JSON.stringify(
        await new Service(root).call(args[ci + 1], input),
        null,
        2
      )
    );
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
} else {
  const html = await readFile(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "app.html"),
    "utf8"
  );
  if (args.includes("--preview")) {
    const { url } = await startPreview(root, html);
    console.log(url);
  } else {
    await createServer(root, html).connect(new StdioServerTransport());
  }
}
