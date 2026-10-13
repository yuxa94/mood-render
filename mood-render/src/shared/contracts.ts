import { z } from "zod";
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);
  }
}
export const id = z.string().uuid();
export const role = z.enum([
  "auto",
  "material",
  "lighting",
  "color",
  "landscape",
  "furniture",
  "mood",
]);
export const boardSchema = z.object({
  items: z
    .array(
      z.object({
        referenceId: id,
        roles: z.array(role).min(1).refine(
          (roles) => !roles.includes("auto") || roles.length === 1,
          "Auto는 다른 역할과 함께 선택할 수 없습니다.",
        ).default(["auto"]),
        target: z.string().max(300).default(""),
        note: z.string().max(3000).default(""),
      }),
    )
    .max(40),
  direction: z.string().max(6000),
  preserve: z.object({
    camera: z.boolean(),
    structure: z.boolean(),
    openings: z.boolean(),
    furniture: z.boolean(),
  }),
});
export type Board = z.infer<typeof boardSchema>;
export interface Asset {
  id: string;
  relativePath: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
  originalName: string;
}
export interface Reference {
  id: string;
  sourceUrl: string;
  imageUrl: string | null;
  title: string;
  reason: string;
  category: string;
  rightsNote: string | null;
  assetId: string | null;
  availability: "link-only" | "ready" | "unavailable";
}
export type Status =
  | "prepared"
  | "dispatched"
  | "running"
  | "needs-result"
  | "completed"
  | "failed";
export interface Job {
  id: string;
  clientRequestId: string;
  requestHash: string;
  snapshotRevision: number;
  snapshot: { sourceAssetId: string; board: Board; references: Reference[] };
  baseResultId: string | null;
  instruction: string;
  status: Status;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface Result {
  id: string;
  jobId: string;
  assetId: string;
  parentResultId: string | null;
  note: string;
  reviewNote: string;
  modelLabel: string | null;
  createdAt: string;
}
export interface Project {
  schemaVersion: 1;
  id: string;
  name: string;
  revision: number;
  sourceAssetId: string | null;
  assets: Asset[];
  references: Reference[];
  board: Board;
  jobs: Job[];
  results: Result[];
  createdAt: string;
  updatedAt: string;
}
export const emptyBoard = (): Board => ({
  items: [],
  direction: "",
  preserve: { camera: true, structure: true, openings: true, furniture: true },
});
export const pidSchema = z.object({ projectId: id });
export const editSchema = pidSchema.extend({
  expectedRevision: z.number().int().nonnegative(),
});
export function fail(code: string, message: string): never {
  throw new DomainError(code, message);
}
export function uuid(value: string) {
  if (!id.safeParse(value).success)
    fail("INVALID_ID", "유효하지 않은 ID입니다.");
  return value;
}
