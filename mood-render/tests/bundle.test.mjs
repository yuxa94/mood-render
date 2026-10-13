import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";
test("inlined browser bundle remains syntactically valid after HTML insertion", async () => {
  const html = await readFile("dist/app.html", "utf8");
  const code = html.slice(
    html.indexOf("<script>") + 8,
    html.lastIndexOf("</script>"),
  );
  assert.doesNotThrow(() => new Script(code));
});
