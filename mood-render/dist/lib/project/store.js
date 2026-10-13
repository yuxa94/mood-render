import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  unlink
} from "node:fs/promises";
import lockfile from "proper-lockfile";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { emptyBoard, fail, uuid } from "../shared/contracts.js";
class Store {
  constructor(root) {
    this.root = root;
  }
  root;
  dir(id) {
    return path.join(this.root, uuid(id));
  }
  async list() {
    await mkdir(this.root, { recursive: true });
    const out = [];
    for (const e of await readdir(this.root, { withFileTypes: true })) {
      if (!e.isDirectory() || !/^[0-9a-f-]{36}$/i.test(e.name)) continue;
      out.push(await this.read(e.name));
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async create(name) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const p = {
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
      updatedAt: now
    };
    await mkdir(this.dir(p.id), { recursive: true });
    await this.save(p);
    return p;
  }
  async read(id) {
    let raw;
    try {
      raw = await readFile(path.join(this.dir(id), "project.json"), "utf8");
    } catch (e) {
      if (e.code === "ENOENT")
        fail("NOT_FOUND", "\uD504\uB85C\uC81D\uD2B8\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      throw e;
    }
    const p = JSON.parse(raw);
    if (p.schemaVersion !== 1)
      fail("UNSUPPORTED_SCHEMA", "\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uD504\uB85C\uC81D\uD2B8 \uBC84\uC804\uC785\uB2C8\uB2E4.");
    if (p.id !== id || !Array.isArray(p.assets) || !Array.isArray(p.jobs))
      fail("INVALID_PROJECT", "\uD504\uB85C\uC81D\uD2B8 \uB370\uC774\uD130\uAC00 \uC190\uC0C1\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
    return p;
  }
  async save(p) {
    const dir = this.dir(p.id), tmp = path.join(dir, `.${randomUUID()}.tmp`);
    try {
      await writeFile(tmp, JSON.stringify(p, null, 2), { mode: 384 });
      await rename(tmp, path.join(dir, "project.json"));
    } finally {
      await unlink(tmp).catch(() => {
      });
    }
  }
  async locked(id, fn) {
    await this.read(id);
    let release;
    try {
      release = await lockfile.lock(path.join(this.dir(id), "project.json"), {
        stale: 1e4,
        update: 2e3,
        retries: 0
      });
    } catch (e) {
      if (e.code === "ELOCKED")
        fail("BUSY", "\uB2E4\uB978 \uCC3D\uC5D0\uC11C \uC800\uC7A5 \uC911\uC785\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694.");
      throw e;
    }
    try {
      return await fn(await this.read(id));
    } finally {
      await release();
    }
  }
  async transact(id, fn) {
    return this.locked(id, async (p) => {
      const result = await fn(p);
      if (result.changed) {
        p.revision++;
        p.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        await this.save(p);
      }
      return result.value;
    });
  }
  async mutate(id, revision, change) {
    return this.transact(id, async (p) => {
      this.expect(p, revision);
      await change(p);
      return { value: p, changed: true };
    });
  }
  expect(p, revision) {
    if (p.revision !== revision)
      fail(
        "REVISION_CONFLICT",
        "\uB2E4\uB978 \uCC3D\uC5D0\uC11C \uBCC0\uACBD\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uCD5C\uC2E0 \uC0C1\uD0DC\uB97C \uBD88\uB7EC\uC628 \uB4A4 \uB2E4\uC2DC \uC800\uC7A5\uD558\uC138\uC694."
      );
  }
}
export {
  Store
};
