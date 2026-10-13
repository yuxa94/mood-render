import { z } from "zod";
import { randomUUID, createHash } from "node:crypto";
import { Store } from "../project/store.js";
import { Assets, CHUNK } from "../assets/store.js";
import {
  id,
  pidSchema,
  editSchema,
  boardSchema,
  fail
} from "../shared/contracts.js";
import { buildBrief } from "../render/brief.js";
const url = z.string().max(4e3).refine((s) => !s || /^https?:\/\//i.test(s), "http/https URL\uC744 \uC0AC\uC6A9\uD558\uC138\uC694.");
const jobSchema = pidSchema.extend({ jobId: id });
class Service {
  store;
  assets;
  tools;
  constructor(root) {
    this.store = new Store(root);
    this.assets = new Assets(this.store);
    const s = this.store;
    const refInput = z.object({
      title: z.string().min(1).max(300),
      sourceUrl: url.default(""),
      imageUrl: url.nullable().optional(),
      reason: z.string().max(2e3).default(""),
      category: z.string().max(60).default("mood"),
      rightsNote: z.string().max(1e3).nullable().optional(),
      assetId: id.nullable().optional()
    });
    this.tools = {
      open_mood_render: {
        description: "Open Mood Render studio. Select references, compose a moodboard and request a photoreal render using Codex built-in image generation.",
        schema: z.object({ projectId: id.optional() }),
        readOnly: true,
        run: async (a) => ({
          projects: await s.list(),
          project: a.projectId ? await s.read(a.projectId) : null
        })
      },
      list_projects: {
        description: "List local Mood Render projects.",
        schema: z.object({}),
        readOnly: true,
        run: async () => s.list()
      },
      create_project: {
        description: "Create a local moodboard project.",
        schema: z.object({ name: z.string().trim().min(1).max(120) }),
        run: async (a) => s.create(a.name)
      },
      get_project: {
        description: "Read current project, board, references and render states.",
        schema: pidSchema,
        readOnly: true,
        run: async (a) => s.read(a.projectId)
      },
      rename_project: {
        description: "Rename project with revision protection.",
        schema: editSchema.extend({ name: z.string().trim().min(1).max(120) }),
        run: async (a) => s.mutate(a.projectId, a.expectedRevision, (p) => {
          p.name = a.name;
        })
      },
      import_image: {
        description: "Import an explicitly selected local PNG/JPEG/WebP, at most 25 MiB, into a project. Does not generate images.",
        schema: editSchema.extend({ path: z.string().min(1) }),
        modelOnly: true,
        run: async (a) => this.assets.import(a.projectId, { path: a.path }, a.expectedRevision)
      },
      upload_image_chunk: {
        description: "Upload a browser-selected image in 256 KiB chunks.",
        schema: pidSchema.extend({
          uploadId: id,
          index: z.number().int().min(0),
          totalChunks: z.number().int().min(1).max(100),
          name: z.string().max(250),
          dataBase64: z.string().max(35e4)
        }),
        uiOnly: true,
        run: async (a) => this.assets.chunk(a)
      },
      finish_image_upload: {
        description: "Validate and register all uploaded image chunks.",
        schema: editSchema.extend({ uploadId: id }),
        uiOnly: true,
        run: async (a) => this.assets.finish(a.projectId, a.uploadId, a.expectedRevision)
      },
      read_image_chunk: {
        description: "Read registered image bytes for the UI.",
        schema: pidSchema.extend({
          assetId: id,
          index: z.number().int().min(0)
        }),
        uiOnly: true,
        readOnly: true,
        run: async (a) => {
          const r = await this.assets.read(a.projectId, a.assetId);
          const totalChunks = Math.ceil(r.bytes.length / CHUNK);
          if (a.index >= totalChunks)
            fail("INVALID_CHUNK", "\uC5C6\uB294 \uC774\uBBF8\uC9C0 \uC870\uAC01\uC785\uB2C8\uB2E4.");
          return {
            dataBase64: r.bytes.subarray(a.index * CHUNK, (a.index + 1) * CHUNK).toString("base64"),
            totalChunks,
            mimeType: r.asset.mimeType
          };
        }
      },
      set_source: {
        description: "Set the original 3D image. Existing render snapshots remain unchanged.",
        schema: editSchema.extend({ assetId: id }),
        run: async (a) => {
          await this.assets.read(a.projectId, a.assetId);
          return s.mutate(a.projectId, a.expectedRevision, (p) => {
            p.sourceAssetId = a.assetId;
          });
        }
      },
      add_references: {
        description: "Register real search candidates with sources. Supply assetId only when actual image pixels were legally obtained and imported. Never invent references.",
        schema: editSchema.extend({ items: z.array(refInput).min(1).max(40) }),
        run: async (a) => {
          for (const r of a.items)
            if (r.assetId) await this.assets.read(a.projectId, r.assetId);
          return s.mutate(a.projectId, a.expectedRevision, (p) => {
            p.references.push(
              ...a.items.map((r) => ({
                id: randomUUID(),
                ...r,
                imageUrl: r.imageUrl || null,
                rightsNote: r.rightsNote || null,
                assetId: r.assetId || null,
                availability: r.assetId ? "ready" : "link-only"
              }))
            );
          });
        }
      },
      attach_reference_image: {
        description: "Attach actual imported image pixels to a reference candidate.",
        schema: editSchema.extend({ referenceId: id, assetId: id }),
        run: async (a) => {
          await this.assets.read(a.projectId, a.assetId);
          return s.mutate(a.projectId, a.expectedRevision, (p) => {
            const r = p.references.find((r2) => r2.id === a.referenceId);
            if (!r) fail("NOT_FOUND", "\uCC38\uC870\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
            r.assetId = a.assetId;
            r.availability = "ready";
          });
        }
      },
      save_board: {
        description: "Save user-selected references and application instructions. Do not auto-select without user authorization.",
        schema: editSchema.extend({ board: boardSchema }),
        run: async (a) => s.mutate(a.projectId, a.expectedRevision, (p) => {
          if (new Set(a.board.items.map((i) => i.referenceId)).size !== a.board.items.length)
            fail("INVALID_BOARD", "\uAC19\uC740 \uCC38\uC870\uB97C \uC911\uBCF5 \uC120\uD0DD\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
          for (const i of a.board.items)
            if (!p.references.some((r) => r.id === i.referenceId))
              fail("NOT_FOUND", "\uC120\uD0DD\uD55C \uCC38\uC870\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
          p.board = a.board;
        })
      },
      prepare_render: {
        description: "Freeze the selected board into an immutable render request. Does not invoke image generation. After preparation send the job to Codex render-from-moodboard skill.",
        schema: editSchema.extend({
          clientRequestId: id,
          baseResultId: id.optional(),
          instruction: z.string().max(6e3).default("")
        }),
        run: async (a) => this.prepare(a)
      },
      get_render: {
        description: "Read a frozen render request and absolute input image paths. Inspect every input using the image viewing tool before using built-in image generation. No model API.",
        schema: jobSchema,
        readOnly: true,
        modelOnly: true,
        run: async (a) => this.getRender(a.projectId, a.jobId)
      },
      set_render_status: {
        description: "Record actual execution state. Mark running only immediately before invoking built-in generation. No output file: needs-result. Never mark completed without register_result.",
        schema: jobSchema.extend({
          status: z.enum([
            "prepared",
            "dispatched",
            "running",
            "needs-result",
            "failed"
          ]),
          error: z.string().max(3e3).optional()
        }),
        run: async (a) => this.status(a)
      },
      register_result: {
        description: "Register a real generated image already imported in this project. Atomically finishes the render and preserves parent history. Never register a placeholder.",
        schema: jobSchema.extend({
          assetId: id,
          note: z.string().max(3e3).default(""),
          reviewNote: z.string().max(6e3).default(""),
          modelLabel: z.string().max(200).nullable().optional()
        }),
        run: async (a) => this.result(a)
      },
      update_result_review: {
        description: "Record visible geometry deviations after comparing actual original and result images.",
        schema: editSchema.extend({
          resultId: id,
          reviewNote: z.string().max(6e3)
        }),
        run: async (a) => s.mutate(a.projectId, a.expectedRevision, (p) => {
          const r = p.results.find((r2) => r2.id === a.resultId);
          if (!r) fail("NOT_FOUND", "\uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
          r.reviewNote = a.reviewNote;
        })
      }
    };
  }
  async call(name, args) {
    const tool = this.tools[name];
    if (!tool) fail("NOT_FOUND", `\uB3C4\uAD6C\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4: ${name}`);
    return tool.run(tool.schema.parse(args));
  }
  async prepare(a) {
    const hash = createHash("sha256").update(
      JSON.stringify({
        revision: a.expectedRevision,
        instruction: a.instruction,
        baseResultId: a.baseResultId || null
      })
    ).digest("hex");
    const job = await this.store.transact(a.projectId, async (p2) => {
      const old = p2.jobs.find((j2) => j2.clientRequestId === a.clientRequestId);
      if (old) {
        if (old.requestHash !== hash)
          fail("REQUEST_CONFLICT", "\uB3D9\uC77C \uC694\uCCAD ID\uC758 \uB0B4\uC6A9\uC774 \uB2E4\uB985\uB2C8\uB2E4.");
        return { value: old, changed: false };
      }
      this.store.expect(p2, a.expectedRevision);
      if (!p2.sourceAssetId)
        fail("MISSING_ASSET", "\uC6D0\uBCF8 3D \uC774\uBBF8\uC9C0\uB97C \uBA3C\uC800 \uB4F1\uB85D\uD558\uC138\uC694.");
      if (!p2.board.items.length)
        fail("MISSING_ASSET", "\uBB34\uB4DC\uBCF4\uB4DC\uC5D0\uC11C \uCC38\uC870 \uC774\uBBF8\uC9C0\uB97C \uC120\uD0DD\uD558\uC138\uC694.");
      await this.assets.read(p2.id, p2.sourceAssetId);
      const refs = p2.board.items.map(
        (i) => p2.references.find((r) => r.id === i.referenceId)
      );
      for (const r of refs) {
        if (!r?.assetId)
          fail(
            "MISSING_ASSET",
            `\uC120\uD0DD\uD55C \uCC38\uC870\uC758 \uC774\uBBF8\uC9C0\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4: ${r?.title || "\uB204\uB77D"} (${r?.id || ""})`
          );
        await this.assets.read(p2.id, r.assetId);
      }
      if (a.baseResultId) {
        const b = p2.results.find((r) => r.id === a.baseResultId);
        if (!b) fail("NOT_FOUND", "\uC218\uC815 \uB300\uC0C1 \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
        await this.assets.read(p2.id, b.assetId);
      }
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const j = {
        id: randomUUID(),
        clientRequestId: a.clientRequestId,
        requestHash: hash,
        snapshotRevision: p2.revision,
        snapshot: structuredClone({
          sourceAssetId: p2.sourceAssetId,
          board: p2.board,
          references: refs
        }),
        baseResultId: a.baseResultId || null,
        instruction: a.instruction,
        status: "prepared",
        error: null,
        createdAt: now,
        updatedAt: now
      };
      p2.jobs.push(j);
      return { value: j, changed: true };
    });
    const p = await this.store.read(a.projectId);
    return { job, brief: buildBrief(p, job), revision: p.revision };
  }
  async getRender(projectId, jobId) {
    const p = await this.store.read(projectId);
    const job = p.jobs.find((j) => j.id === jobId);
    if (!job) fail("NOT_FOUND", "\uC2E4\uD589 \uC694\uCCAD\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
    const inputs = [
      {
        id: job.snapshot.sourceAssetId,
        role: "original geometry / edit target"
      }
    ];
    if (job.baseResultId) {
      const b = p.results.find((r) => r.id === job.baseResultId);
      if (!b) fail("MISSING_ASSET", "\uC774\uC804 \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
      inputs.push({
        id: b.assetId,
        role: "edit target; original remains geometry reference"
      });
    }
    for (const item of job.snapshot.board.items) {
      const r = job.snapshot.references.find((r2) => r2.id === item.referenceId);
      inputs.push({
        id: r.assetId,
        role: `reference: ${item.roles.join(", ")}; ${item.target}`
      });
    }
    const inputFiles = [];
    for (const i of inputs) {
      const r = await this.assets.read(projectId, i.id);
      inputFiles.push({
        assetId: i.id,
        path: r.path,
        mimeType: r.asset.mimeType,
        role: i.role
      });
    }
    return { job, brief: buildBrief(p, job), inputFiles };
  }
  async status(a) {
    return this.store.transact(a.projectId, (p) => {
      const j = p.jobs.find((j2) => j2.id === a.jobId);
      if (!j) fail("NOT_FOUND", "\uC2E4\uD589 \uC694\uCCAD\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
      if (j.status === a.status || j.status === "running" && a.status === "dispatched")
        return { value: j, changed: false };
      const allowed = {
        prepared: ["dispatched", "running", "failed"],
        dispatched: ["running", "failed"],
        running: ["needs-result", "failed"],
        "needs-result": ["failed"],
        completed: [],
        failed: []
      };
      if (!allowed[j.status].includes(a.status))
        fail(
          "INVALID_TRANSITION",
          `${j.status} \u2192 ${a.status} \uBCC0\uACBD\uC740 \uD5C8\uC6A9\uB418\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.`
        );
      j.status = a.status;
      j.error = a.error || null;
      j.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      return { value: j, changed: true };
    });
  }
  async result(a) {
    await this.assets.read(a.projectId, a.assetId);
    return this.store.transact(a.projectId, (p) => {
      const j = p.jobs.find((j2) => j2.id === a.jobId);
      if (!j) fail("NOT_FOUND", "\uC694\uCCAD\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
      const old = p.results.find((r2) => r2.jobId === a.jobId);
      if (old) {
        if (old.assetId !== a.assetId)
          fail("REQUEST_CONFLICT", "\uC774 \uC694\uCCAD\uC5D0\uB294 \uC774\uBBF8 \uB2E4\uB978 \uACB0\uACFC\uAC00 \uC788\uC2B5\uB2C8\uB2E4.");
        return { value: { result: old, project: p }, changed: false };
      }
      if (!["running", "needs-result"].includes(j.status))
        fail(
          "INVALID_TRANSITION",
          "\uC2E4\uD589 \uC911\uC774\uAC70\uB098 \uACB0\uACFC \uB4F1\uB85D\uC774 \uD544\uC694\uD55C \uC694\uCCAD\uB9CC \uC644\uB8CC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."
        );
      if (a.assetId === j.snapshot.sourceAssetId)
        fail("INVALID_IMAGE", "\uC6D0\uBCF8 \uC774\uBBF8\uC9C0\uB97C \uC0DD\uC131 \uACB0\uACFC\uB85C \uB4F1\uB85D\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      const r = {
        id: randomUUID(),
        jobId: j.id,
        assetId: a.assetId,
        parentResultId: j.baseResultId,
        note: a.note || "",
        reviewNote: a.reviewNote || "",
        modelLabel: a.modelLabel || null,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      p.results.push(r);
      j.status = "completed";
      j.updatedAt = r.createdAt;
      return { value: { result: r, project: p }, changed: true };
    });
  }
}
export {
  Service
};
