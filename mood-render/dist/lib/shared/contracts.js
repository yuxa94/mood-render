import { z } from "zod";
class DomainError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.code = code;
  }
  code;
}
const id = z.string().uuid();
const role = z.enum([
  "auto",
  "material",
  "lighting",
  "color",
  "landscape",
  "furniture",
  "mood"
]);
const boardSchema = z.object({
  items: z.array(
    z.object({
      referenceId: id,
      roles: z.array(role).min(1).refine(
        (roles) => !roles.includes("auto") || roles.length === 1,
        "Auto\uB294 \uB2E4\uB978 \uC5ED\uD560\uACFC \uD568\uAED8 \uC120\uD0DD\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."
      ).default(["auto"]),
      target: z.string().max(300).default(""),
      note: z.string().max(3e3).default("")
    })
  ).max(40),
  direction: z.string().max(6e3),
  preserve: z.object({
    camera: z.boolean(),
    structure: z.boolean(),
    openings: z.boolean(),
    furniture: z.boolean()
  })
});
const emptyBoard = () => ({
  items: [],
  direction: "",
  preserve: { camera: true, structure: true, openings: true, furniture: true }
});
const pidSchema = z.object({ projectId: id });
const editSchema = pidSchema.extend({
  expectedRevision: z.number().int().nonnegative()
});
function fail(code, message) {
  throw new DomainError(code, message);
}
function uuid(value) {
  if (!id.safeParse(value).success)
    fail("INVALID_ID", "\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 ID\uC785\uB2C8\uB2E4.");
  return value;
}
export {
  DomainError,
  boardSchema,
  editSchema,
  emptyBoard,
  fail,
  id,
  pidSchema,
  role,
  uuid
};
