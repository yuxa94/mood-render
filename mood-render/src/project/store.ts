import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  unlink,
} from "node:fs/promises";
import lockfile from "proper-lockfile";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { type Project, emptyBoard, fail, uuid } from "../shared/contracts.js";
export class Store {
  constructor(public root: string) {}
  dir(id: string) {
    return path.join(this.root, uuid(id));
  }
  async list() {
    await mkdir(this.root, { recursive: true });
    const out: Project[] = [];
    for (const e of await readdir(this.root, { withFileTypes: true })) {
      if (!e.isDirectory() || !/^[0-9a-f-]{36}$/i.test(e.name)) continue;
      out.push(await this.read(e.name));
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async create(name: string) {
    const now = new Date().toISOString();
    const p: Project = {
      schemaVersion: 1,
      id: randomUUID(),
      name,
      revision: 0,
      sourceAssetId: null,
      assets: [],
      references: [],
      board: emptyBoard(),
      jobs: [],
      results: [],
      createdAt: now,
      updatedAt: now,
    };
    await mkdir(this.dir(p.id), { recursive: true });
    await this.save(p);
    return p;
  }
  async read(id: string): Promise<Project> {
    let raw: string;
    try {
      raw = await readFile(path.join(this.dir(id), "project.json"), "utf8");
    } catch (e: any) {
      if (e.code === "ENOENT")
        fail("NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
      throw e;
    }
    const p = JSON.parse(raw);
    if (p.schemaVersion !== 1)
      fail("UNSUPPORTED_SCHEMA", "지원하지 않는 프로젝트 버전입니다.");
    if (p.id !== id || !Array.isArray(p.assets) || !Array.isArray(p.jobs))
      fail("INVALID_PROJECT", "프로젝트 데이터가 손상되었습니다.");
    return p;
  }
  private async save(p: Project) {
    const dir = this.dir(p.id),
      tmp = path.join(dir, `.${randomUUID()}.tmp`);
    try {
      await writeFile(tmp, JSON.stringify(p, null, 2), { mode: 0o600 });
      await rename(tmp, path.join(dir, "project.json"));
    } finally {
      await unlink(tmp).catch(() => {});
    }
  }
  async locked<T>(id: string, fn: (p: Project) => Promise<T> | T): Promise<T> {
    await this.read(id);
    let release: () => Promise<void>;
    try {
      release = await lockfile.lock(path.join(this.dir(id), "project.json"), {
        stale: 10000,
        update: 2000,
        retries: 0,
      });
    } catch (e: any) {
      if (e.code === "ELOCKED")
        fail("BUSY", "다른 창에서 저장 중입니다. 잠시 후 다시 시도하세요.");
      throw e;
    }
    try {
      return await fn(await this.read(id));
    } finally {
      await release();
    }
  }
  async transact<T>(
    id: string,
    fn: (
      p: Project,
    ) =>
      | Promise<{ value: T; changed: boolean }>
      | { value: T; changed: boolean },
  ): Promise<T> {
    return this.locked(id, async (p) => {
      const result = await fn(p);
      if (result.changed) {
        p.revision++;
        p.updatedAt = new Date().toISOString();
        await this.save(p);
      }
      return result.value;
    });
  }
  async mutate(
    id: string,
    revision: number,
    change: (p: Project) => void | Promise<void>,
  ) {
    return this.transact(id, async (p) => {
      this.expect(p, revision);
      await change(p);
      return { value: p, changed: true };
    });
  }
  expect(p: Project, revision: number) {
    if (p.revision !== revision)
      fail(
        "REVISION_CONFLICT",
        "다른 창에서 변경되었습니다. 최신 상태를 불러온 뒤 다시 저장하세요.",
      );
  }
}
