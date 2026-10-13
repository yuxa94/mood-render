import { z } from "zod";
import { randomUUID, createHash } from "node:crypto";
import { Store } from "../project/store.js";
import { Assets, CHUNK } from "../assets/store.js";
import {
  id,
  pidSchema,
  editSchema,
  boardSchema,
  fail,
  type Project,
  type Job,
  type Status,
} from "../shared/contracts.js";
import { buildBrief } from "../render/brief.js";
const url = z
  .string()
  .max(4000)
  .refine((s) => !s || /^https?:\/\//i.test(s), "http/https URL을 사용하세요.");
const jobSchema = pidSchema.extend({ jobId: id });
export interface ToolDef {
  description: string;
  schema: z.ZodType;
  run: (args: any) => Promise<any>;
  readOnly?: boolean;
  modelOnly?: boolean;
  uiOnly?: boolean;
}
export class Service {
  store: Store;
  assets: Assets;
  tools: Record<string, ToolDef>;
  constructor(root: string) {
    this.store = new Store(root);
    this.assets = new Assets(this.store);
    const s = this.store;
    const refInput = z.object({
      title: z.string().min(1).max(300),
      sourceUrl: url.default(""),
      imageUrl: url.nullable().optional(),
      reason: z.string().max(2000).default(""),
      category: z.string().max(60).default("mood"),
      rightsNote: z.string().max(1000).nullable().optional(),
      assetId: id.nullable().optional(),
    });
    this.tools = {
      open_mood_render: {
        description:
          "Open Mood Render studio. Select references, compose a moodboard and request a photoreal render using Codex built-in image generation.",
        schema: z.object({ projectId: id.optional() }),
        readOnly: true,
        run: async (a) => ({
          projects: await s.list(),
          project: a.projectId ? await s.read(a.projectId) : null,
        }),
      },
      list_projects: {
        description: "List local Mood Render projects.",
        schema: z.object({}),
        readOnly: true,
        run: async () => s.list(),
      },
      create_project: {
        description: "Create a local moodboard project.",
        schema: z.object({ name: z.string().trim().min(1).max(120) }),
        run: async (a) => s.create(a.name),
      },
      get_project: {
        description:
          "Read current project, board, references and render states.",
        schema: pidSchema,
        readOnly: true,
        run: async (a) => s.read(a.projectId),
      },
      rename_project: {
        description: "Rename project with revision protection.",
        schema: editSchema.extend({ name: z.string().trim().min(1).max(120) }),
        run: async (a) =>
          s.mutate(a.projectId, a.expectedRevision, (p) => {
            p.name = a.name;
          }),
      },
      import_image: {
        description:
          "Import an explicitly selected local PNG/JPEG/WebP, at most 25 MiB, into a project. Does not generate images.",
        schema: editSchema.extend({ path: z.string().min(1) }),
        modelOnly: true,
        run: async (a) =>
          this.assets.import(a.projectId, { path: a.path }, a.expectedRevision),
      },
      upload_image_chunk: {
        description: "Upload a browser-selected image in 256 KiB chunks.",
        schema: pidSchema.extend({
          uploadId: id,
          index: z.number().int().min(0),
          totalChunks: z.number().int().min(1).max(100),
          name: z.string().max(250),
          dataBase64: z.string().max(350000),
        }),
        uiOnly: true,
        run: async (a) => this.assets.chunk(a),
      },
      finish_image_upload: {
        description: "Validate and register all uploaded image chunks.",
        schema: editSchema.extend({ uploadId: id }),
        uiOnly: true,
        run: async (a) =>
          this.assets.finish(a.projectId, a.uploadId, a.expectedRevision),
      },
      read_image_chunk: {
        description: "Read registered image bytes for the UI.",
        schema: pidSchema.extend({
          assetId: id,
          index: z.number().int().min(0),
        }),
        uiOnly: true,
        readOnly: true,
        run: async (a) => {
          const r = await this.assets.read(a.projectId, a.assetId);
          const totalChunks = Math.ceil(r.bytes.length / CHUNK);
          if (a.index >= totalChunks)
            fail("INVALID_CHUNK", "없는 이미지 조각입니다.");
          return {
            dataBase64: r.bytes
              .subarray(a.index * CHUNK, (a.index + 1) * CHUNK)
              .toString("base64"),
            totalChunks,
            mimeType: r.asset.mimeType,
          };
        },
      },
      set_source: {
        description:
          "Set the original 3D image. Existing render snapshots remain unchanged.",
        schema: editSchema.extend({ assetId: id }),
        run: async (a) => {
          await this.assets.read(a.projectId, a.assetId);
          return s.mutate(a.projectId, a.expectedRevision, (p) => {
            p.sourceAssetId = a.assetId;
          });
        },
      },
      add_references: {
        description:
          "Register real search candidates with sources. Supply assetId only when actual image pixels were legally obtained and imported. Never invent references.",
        schema: editSchema.extend({ items: z.array(refInput).min(1).max(40) }),
        run: async (a) => {
          for (const r of a.items)
            if (r.assetId) await this.assets.read(a.projectId, r.assetId);
          return s.mutate(a.projectId, a.expectedRevision, (p) => {
            p.references.push(
              ...a.items.map((r: any) => ({
                id: randomUUID(),
                ...r,
                imageUrl: r.imageUrl || null,
                rightsNote: r.rightsNote || null,
                assetId: r.assetId || null,
                availability: r.assetId ? "ready" : "link-only",
              })),
            );
          });
        },
      },
      attach_reference_image: {
        description:
          "Attach actual imported image pixels to a reference candidate.",
        schema: editSchema.extend({ referenceId: id, assetId: id }),
        run: async (a) => {
          await this.assets.read(a.projectId, a.assetId);
          return s.mutate(a.projectId, a.expectedRevision, (p) => {
            const r = p.references.find((r) => r.id === a.referenceId);
            if (!r) fail("NOT_FOUND", "참조가 없습니다.");
            r.assetId = a.assetId;
            r.availability = "ready";
          });
        },
      },
      save_board: {
        description:
          "Save user-selected references and application instructions. Do not auto-select without user authorization.",
        schema: editSchema.extend({ board: boardSchema }),
        run: async (a) =>
          s.mutate(a.projectId, a.expectedRevision, (p) => {
            if (
              new Set(a.board.items.map((i: any) => i.referenceId)).size !==
              a.board.items.length
            )
              fail("INVALID_BOARD", "같은 참조를 중복 선택할 수 없습니다.");
            for (const i of a.board.items)
              if (!p.references.some((r) => r.id === i.referenceId))
                fail("NOT_FOUND", "선택한 참조가 없습니다.");
            p.board = a.board;
          }),
      },
      prepare_render: {
        description:
          "Freeze the selected board into an immutable render request. Does not invoke image generation. After preparation send the job to Codex render-from-moodboard skill.",
        schema: editSchema.extend({
          clientRequestId: id,
          baseResultId: id.optional(),
          instruction: z.string().max(6000).default(""),
        }),
        run: async (a) => this.prepare(a),
      },
      get_render: {
        description:
          "Read a frozen render request and absolute input image paths. Inspect every input using the image viewing tool before using built-in image generation. No model API.",
        schema: jobSchema,
        readOnly: true,
        modelOnly: true,
        run: async (a) => this.getRender(a.projectId, a.jobId),
      },
      set_render_status: {
        description:
          "Record actual execution state. Mark running only immediately before invoking built-in generation. No output file: needs-result. Never mark completed without register_result.",
        schema: jobSchema.extend({
          status: z.enum([
            "prepared",
            "dispatched",
            "running",
            "needs-result",
            "failed",
          ]),
          error: z.string().max(3000).optional(),
        }),
        run: async (a) => this.status(a),
      },
      register_result: {
        description:
          "Register a real generated image already imported in this project. Atomically finishes the render and preserves parent history. Never register a placeholder.",
        schema: jobSchema.extend({
          assetId: id,
          note: z.string().max(3000).default(""),
          reviewNote: z.string().max(6000).default(""),
          modelLabel: z.string().max(200).nullable().optional(),
        }),
        run: async (a) => this.result(a),
      },
      update_result_review: {
        description:
          "Record visible geometry deviations after comparing actual original and result images.",
        schema: editSchema.extend({
          resultId: id,
          reviewNote: z.string().max(6000),
        }),
        run: async (a) =>
          s.mutate(a.projectId, a.expectedRevision, (p) => {
            const r = p.results.find((r) => r.id === a.resultId);
            if (!r) fail("NOT_FOUND", "결과가 없습니다.");
            r.reviewNote = a.reviewNote;
          }),
      },
    };
  }
  async call(name: string, args: unknown) {
    const tool = this.tools[name];
    if (!tool) fail("NOT_FOUND", `도구를 찾을 수 없습니다: ${name}`);
    return tool.run(tool.schema.parse(args));
  }
  private async prepare(a: any) {
    const hash = createHash("sha256")
      .update(
        JSON.stringify({
          revision: a.expectedRevision,
          instruction: a.instruction,
          baseResultId: a.baseResultId || null,
        }),
      )
      .digest("hex");
    const job = await this.store.transact(a.projectId, async (p) => {
      const old = p.jobs.find((j) => j.clientRequestId === a.clientRequestId);
      if (old) {
        if (old.requestHash !== hash)
          fail("REQUEST_CONFLICT", "동일 요청 ID의 내용이 다릅니다.");
        return { value: old, changed: false };
      }
      this.store.expect(p, a.expectedRevision);
      if (!p.sourceAssetId)
        fail("MISSING_ASSET", "원본 3D 이미지를 먼저 등록하세요.");
      if (!p.board.items.length)
        fail("MISSING_ASSET", "무드보드에서 참조 이미지를 선택하세요.");
      await this.assets.read(p.id, p.sourceAssetId);
      const refs = p.board.items.map(
        (i) => p.references.find((r) => r.id === i.referenceId)!,
      );
      for (const r of refs) {
        if (!r?.assetId)
          fail(
            "MISSING_ASSET",
            `선택한 참조의 이미지가 필요합니다: ${r?.title || "누락"} (${r?.id || ""})`,
          );
        await this.assets.read(p.id, r.assetId);
      }
      if (a.baseResultId) {
        const b = p.results.find((r) => r.id === a.baseResultId);
        if (!b) fail("NOT_FOUND", "수정 대상 결과가 없습니다.");
        await this.assets.read(p.id, b.assetId);
      }
      const now = new Date().toISOString();
      const j: Job = {
        id: randomUUID(),
        clientRequestId: a.clientRequestId,
        requestHash: hash,
        snapshotRevision: p.revision,
        snapshot: structuredClone({
          sourceAssetId: p.sourceAssetId,
          board: p.board,
          references: refs,
        }),
        baseResultId: a.baseResultId || null,
        instruction: a.instruction,
        status: "prepared",
        error: null,
        createdAt: now,
        updatedAt: now,
      };
      p.jobs.push(j);
      return { value: j, changed: true };
    });
    const p = await this.store.read(a.projectId);
    return { job, brief: buildBrief(p, job), revision: p.revision };
  }
  private async getRender(projectId: string, jobId: string) {
    const p = await this.store.read(projectId);
    const job = p.jobs.find((j) => j.id === jobId);
    if (!job) fail("NOT_FOUND", "실행 요청이 없습니다.");
    const inputs = [
      {
        id: job.snapshot.sourceAssetId,
        role: "original geometry / edit target",
      },
    ];
    if (job.baseResultId) {
      const b = p.results.find((r) => r.id === job.baseResultId);
      if (!b) fail("MISSING_ASSET", "이전 결과가 없습니다.");
      inputs.push({
        id: b.assetId,
        role: "edit target; original remains geometry reference",
      });
    }
    for (const item of job.snapshot.board.items) {
      const r = job.snapshot.references.find((r) => r.id === item.referenceId)!;
      inputs.push({
        id: r.assetId!,
        role: `reference: ${item.roles.join(", ")}; ${item.target}`,
      });
    }
    const inputFiles = [];
    for (const i of inputs) {
      const r = await this.assets.read(projectId, i.id);
      inputFiles.push({
        assetId: i.id,
        path: r.path,
        mimeType: r.asset.mimeType,
        role: i.role,
      });
    }
    return { job, brief: buildBrief(p, job), inputFiles };
  }
  private async status(a: any) {
    return this.store.transact(a.projectId, (p) => {
      const j = p.jobs.find((j) => j.id === a.jobId);
      if (!j) fail("NOT_FOUND", "실행 요청이 없습니다.");
      if (
        j.status === a.status ||
        (j.status === "running" && a.status === "dispatched")
      )
        return { value: j, changed: false };
      const allowed: Record<Status, string[]> = {
        prepared: ["dispatched", "running", "failed"],
        dispatched: ["running", "failed"],
        running: ["needs-result", "failed"],
        "needs-result": ["failed"],
        completed: [],
        failed: [],
      };
      if (!allowed[j.status].includes(a.status))
        fail(
          "INVALID_TRANSITION",
          `${j.status} → ${a.status} 변경은 허용되지 않습니다.`,
        );
      j.status = a.status;
      j.error = a.error || null;
      j.updatedAt = new Date().toISOString();
      return { value: j, changed: true };
    });
  }
  private async result(a: any) {
    await this.assets.read(a.projectId, a.assetId);
    return this.store.transact(a.projectId, (p) => {
      const j = p.jobs.find((j) => j.id === a.jobId);
      if (!j) fail("NOT_FOUND", "요청이 없습니다.");
      const old = p.results.find((r) => r.jobId === a.jobId);
      if (old) {
        if (old.assetId !== a.assetId)
          fail("REQUEST_CONFLICT", "이 요청에는 이미 다른 결과가 있습니다.");
        return { value: { result: old, project: p }, changed: false };
      }
      if (!["running", "needs-result"].includes(j.status))
        fail(
          "INVALID_TRANSITION",
          "실행 중이거나 결과 등록이 필요한 요청만 완료할 수 있습니다.",
        );
      if (a.assetId === j.snapshot.sourceAssetId)
        fail("INVALID_IMAGE", "원본 이미지를 생성 결과로 등록할 수 없습니다.");
      const r = {
        id: randomUUID(),
        jobId: j.id,
        assetId: a.assetId,
        parentResultId: j.baseResultId,
        note: a.note || "",
        reviewNote: a.reviewNote || "",
        modelLabel: a.modelLabel || null,
        createdAt: new Date().toISOString(),
      };
      p.results.push(r);
      j.status = "completed";
      j.updatedAt = r.createdAt;
      return { value: { result: r, project: p }, changed: true };
    });
  }
}
