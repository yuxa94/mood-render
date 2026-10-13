import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
test("installed stdio endpoint exposes the actual studio and persistent project tools", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "mood-mcp-"));
  const c = new Client({ name: "mood-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/server.mjs"],
    env: { ...process.env, MOOD_RENDER_DATA_ROOT: root },
  });
  t.after(async () => {
    await c.close();
    await rm(root, { recursive: true, force: true });
  });
  await c.connect(transport);
  const list = await c.listTools();
  assert.ok(list.tools.some((t) => t.name === "prepare_render"));
  const p = await c.callTool({
    name: "create_project",
    arguments: { name: "stdio project" },
  });
  assert.equal(p.structuredContent.data.name, "stdio project");
  const r = await c.readResource({ uri: "ui://mood-render/v0.1.4/app.html" });
  assert.equal(r.contents[0].mimeType, "text/html;profile=mcp-app");
  assert.match(r.contents[0].text, /Mood Render/);
});
