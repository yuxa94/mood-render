import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const { Service } = await import("../dist/lib/server/service.js");
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG1sAAAAASUVORK5CYII=",
  "base64",
);
async function ctx(t) {
  const root = await mkdtemp(path.join(tmpdir(), "mood-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  const s = new Service(root),
    p = await s.call("create_project", { name: "test" });
  return { s, id: p.id };
}
async function image(s, id, name = "test.png") {
  const u = crypto.randomUUID();
  await s.call("upload_image_chunk", {
    projectId: id,
    uploadId: u,
    index: 0,
    totalChunks: 1,
    name,
    dataBase64: png.toString("base64"),
  });
  return s.call("finish_image_upload", {
    projectId: id,
    uploadId: u,
    expectedRevision: (await s.call("get_project", { projectId: id })).revision,
  });
}
async function ready(t) {
  const { s, id } = await ctx(t);
  const a = await image(s, id);
  let p = await s.call("set_source", {
    projectId: id,
    assetId: a.asset.id,
    expectedRevision: a.revision,
  });
  p = await s.call("add_references", {
    projectId: id,
    expectedRevision: p.revision,
    items: [
      {
        title: "Oak",
        sourceUrl: "https://example.com/oak",
        reason: "wood",
        category: "material",
        assetId: a.asset.id,
      },
    ],
  });
  p = await s.call("save_board", {
    projectId: id,
    expectedRevision: p.revision,
    board: {
      ...p.board,
      items: [
        {
          referenceId: p.references[0].id,
          roles: ["material"],
          target: "벽",
          note: "참나무",
          strength: "medium",
        },
      ],
    },
  });
  return { s, id, p, a };
}
test("same image names do not overwrite source files", async (t) => {
  const { s, id } = await ctx(t);
  const a = await image(s, id, "같은 이름.png"),
    b = await image(s, id, "같은 이름.png");
  assert.notEqual(a.asset.id, b.asset.id);
  assert.equal(
    (await s.call("get_project", { projectId: id })).assets.length,
    2,
  );
});
test("link-only references cannot silently be omitted from render", async (t) => {
  const { s, id } = await ctx(t);
  const a = await image(s, id);
  let p = await s.call("set_source", {
    projectId: id,
    assetId: a.asset.id,
    expectedRevision: a.revision,
  });
  p = await s.call("add_references", {
    projectId: id,
    expectedRevision: p.revision,
    items: [
      {
        title: "link",
        sourceUrl: "https://example.com",
        reason: "mood",
        category: "mood",
      },
    ],
  });
  assert.equal(p.references[0].availability, "link-only");
  p = await s.call("save_board", {
    projectId: id,
    expectedRevision: p.revision,
    board: {
      ...p.board,
      items: [
        {
          referenceId: p.references[0].id,
          roles: ["mood"],
          target: "전체",
          note: "",
          strength: "medium",
        },
      ],
    },
  });
  await assert.rejects(
    () =>
      s.call("prepare_render", {
        projectId: id,
        expectedRevision: p.revision,
        clientRequestId: crypto.randomUUID(),
        instruction: "",
      }),
    (e) => e.code === "MISSING_ASSET",
  );
});
test("job snapshots survive edits and duplicate request replays", async (t) => {
  let { s, id, p } = await ready(t);
  const args = {
    projectId: id,
    expectedRevision: p.revision,
    clientRequestId: crypto.randomUUID(),
    instruction: "따뜻한 빛",
  };
  const j = await s.call("prepare_render", args);
  const replay = await s.call("prepare_render", args);
  assert.equal(j.job.id, replay.job.id);
  p = await s.call("get_project", { projectId: id });
  await s.call("save_board", {
    projectId: id,
    expectedRevision: p.revision,
    board: { ...p.board, direction: "cold" },
  });
  const saved = await s.call("get_render", { projectId: id, jobId: j.job.id });
  assert.equal(saved.job.snapshot.board.direction, "");
  assert.equal(saved.inputFiles.length, 2);
  assert.match(saved.brief, /참나무/);
  await assert.rejects(
    () => s.call("prepare_render", { ...args, instruction: "different" }),
    (e) => e.code === "REQUEST_CONFLICT",
  );
});
test("a render cannot complete without a real result; revisions have parents", async (t) => {
  const { s, id, p, a } = await ready(t);
  const j = await s.call("prepare_render", {
    projectId: id,
    expectedRevision: p.revision,
    clientRequestId: crypto.randomUUID(),
    instruction: "",
  });
  await assert.rejects(() =>
    s.call("set_render_status", {
      projectId: id,
      jobId: j.job.id,
      status: "completed",
    }),
  );
  await s.call("set_render_status", {
    projectId: id,
    jobId: j.job.id,
    status: "running",
  });
  await s.call("set_render_status", {
    projectId: id,
    jobId: j.job.id,
    status: "needs-result",
  });
  assert.equal(
    (await s.call("get_project", { projectId: id })).results.length,
    0,
  );
  const out = await image(s, id);
  const r = await s.call("register_result", {
    projectId: id,
    jobId: j.job.id,
    assetId: out.asset.id,
    note: "first",
    reviewNote: "fixture",
  });
  assert.equal(r.project.jobs[0].status, "completed");
  assert.equal(
    (
      await s.call("register_result", {
        projectId: id,
        jobId: j.job.id,
        assetId: out.asset.id,
      })
    ).result.id,
    r.result.id,
  );
  const next = await s.call("prepare_render", {
    projectId: id,
    expectedRevision: r.project.revision,
    clientRequestId: crypto.randomUUID(),
    baseResultId: r.result.id,
    instruction: "lighter",
  });
  await s.call("set_render_status", {
    projectId: id,
    jobId: next.job.id,
    status: "running",
  });
  const out2 = await image(s, id);
  const r2 = await s.call("register_result", {
    projectId: id,
    jobId: next.job.id,
    assetId: out2.asset.id,
  });
  assert.equal(r2.result.parentResultId, r.result.id);
  assert.equal(r2.project.sourceAssetId, a.asset.id);
});
test("broken upload and non-images never enter assets", async (t) => {
  const { s, id } = await ctx(t),
    u = crypto.randomUUID();
  await s.call("upload_image_chunk", {
    projectId: id,
    uploadId: u,
    index: 0,
    totalChunks: 2,
    name: "a.png",
    dataBase64: png.toString("base64"),
  });
  await assert.rejects(() =>
    s.call("finish_image_upload", {
      projectId: id,
      uploadId: u,
      expectedRevision: 0,
    }),
  );
  const v = crypto.randomUUID();
  await s.call("upload_image_chunk", {
    projectId: id,
    uploadId: v,
    index: 0,
    totalChunks: 1,
    name: "a.png",
    dataBase64: Buffer.from("<html>").toString("base64"),
  });
  await assert.rejects(() =>
    s.call("finish_image_upload", {
      projectId: id,
      uploadId: v,
      expectedRevision: 0,
    }),
  );
  assert.equal(
    (await s.call("get_project", { projectId: id })).assets.length,
    0,
  );
});

test("Auto board renders without per-card fields and ignores legacy strength", async (t) => {
  let { s, id, p } = await ready(t);
  p = await s.call("save_board", {
    projectId: id, expectedRevision: p.revision,
    board: { ...p.board, items: [{ referenceId: p.references[0].id, roles: ["auto"], strength: "high" }] },
  });
  assert.deepEqual(p.board.items[0].roles, ["auto"]);
  assert.equal(p.board.items[0].strength, undefined);
  const render = await s.call("prepare_render", {
    projectId: id, expectedRevision: p.revision, clientRequestId: crypto.randomUUID(), instruction: "",
  });
  assert.match(render.brief, /자동/);
  assert.doesNotMatch(render.brief, /강도=|undefined/);
  const saved = await s.call("get_render", { projectId: id, jobId: render.job.id });
  assert.equal(saved.inputFiles.length, 2);
  assert.deepEqual(saved.job.snapshot.board.items[0].roles, ["auto"]);
});

test("Auto cannot be combined with explicit reference roles", async (t) => {
  const { s, id, p } = await ready(t);
  await assert.rejects(() => s.call("save_board", {
    projectId: id, expectedRevision: p.revision,
    board: { ...p.board, items: [{ ...p.board.items[0], roles: ["auto", "material"] }] },
  }));
});
