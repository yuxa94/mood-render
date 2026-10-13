import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, cp, utimes } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
const { Store } = await import("../dist/lib/project/store.js");
async function setup(t) {
  const root = await mkdtemp(path.join(tmpdir(), "무드 테스트 "));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, store: new Store(root) };
}
test("project reopens after a data-root move", async (t) => {
  const { root, store } = await setup(t);
  const p = await store.create("한글 프로젝트");
  await store.mutate(p.id, p.revision, (p) => {
    p.name = "이름 변경";
  });
  await cp(root, root + " copy", { recursive: true });
  t.after(() => rm(root + " copy", { recursive: true, force: true }));
  assert.equal((await new Store(root + " copy").read(p.id)).name, "이름 변경");
});
test("concurrent same-revision writes cannot silently overwrite", async (t) => {
  const { root, store } = await setup(t);
  const p = await store.create("a");
  const rs = await Promise.allSettled([
    store.mutate(p.id, 0, (p) => {
      p.name = "b";
    }),
    new Store(root).mutate(p.id, 0, (p) => {
      p.name = "c";
    }),
  ]);
  assert.equal(rs.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(
    ["BUSY", "REVISION_CONFLICT"].includes(
      rs.find((r) => r.status === "rejected").reason.code,
    ),
  );
  assert.equal((await store.read(p.id)).revision, 1);
});
test("project ids cannot escape the data root", async (t) => {
  const { store } = await setup(t);
  await assert.rejects(() => store.read("../escape"), /INVALID_ID/);
});
test("crashed writer recovers after stale interval without stealing a live lock", async (t) => {
  const { root, store } = await setup(t);
  const p = await store.create("crash recovery");
  const moduleUrl = new URL("../dist/lib/project/store.js", import.meta.url)
    .href;
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import {Store} from ${JSON.stringify(moduleUrl)};
     await new Store(process.argv[1]).locked(process.argv[2], async () => {
       console.log('locked'); await new Promise(() => { setInterval(() => {}, 1000); });
     });`,
      root,
      p.id,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  t.after(() => child.kill("SIGKILL"));
  await once(child.stdout, "data");
  await assert.rejects(() => store.mutate(p.id, 0, () => {}), { code: "BUSY" });
  const exited = once(child, "exit");
  child.kill("SIGKILL");
  await exited;
  // Advance only the abandoned lock's clock; keep the test quick.
  const old = new Date(Date.now() - 11000);
  await utimes(path.join(root, p.id, "project.json.lock"), old, old);
  await store.mutate(p.id, 0, (project) => {
    project.name = "recovered";
  });
  assert.equal((await store.read(p.id)).name, "recovered");
});
