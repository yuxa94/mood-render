import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const temp = await mkdtemp(path.join(tmpdir(), "무드 패키지 검증 "));
const client = new Client({ name: "package-verification", version: "1.0.0" });
try {
  execFileSync("/usr/bin/ditto", [
    "-x",
    "-k",
    path.resolve("releases", `mood-render-${pkg.version}.zip`),
    temp,
  ]);
  const root = path.join(temp, "mood-render");
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [path.join(root, "dist/server.mjs")],
      cwd: root,
      env: { ...process.env, MOOD_RENDER_DATA_ROOT: path.join(temp, "data") },
    }),
  );
  assert.ok(
    (await client.listTools()).tools.some((t) => t.name === "open_mood_render"),
  );
  const created = await client.callTool({
    name: "create_project",
    arguments: { name: "이동된 패키지 테스트" },
  });
  assert.equal(created.structuredContent.data.name, "이동된 패키지 테스트");
  const resource = await client.readResource({
    uri: `ui://mood-render/v${pkg.version}/app.html`,
  });
  assert.match(resource.contents[0].text, /Mood Render/);
  console.log(
    "PASS: ZIP extracts and runs without node_modules in a path containing spaces and Korean text.",
  );
} finally {
  await client.close();
  await rm(temp, { recursive: true, force: true });
}
