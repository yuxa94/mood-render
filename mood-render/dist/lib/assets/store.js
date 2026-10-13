import {
  readFile,
  writeFile,
  mkdir,
  stat,
  realpath,
  unlink
} from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { fail, uuid } from "../shared/contracts.js";
const CHUNK = 256 * 1024, MAX_IMAGE = 25 * 1024 * 1024;
function imageType(b) {
  if (b.length < 16 || b.length > MAX_IMAGE)
    fail("INVALID_IMAGE", "\uC774\uBBF8\uC9C0\uB294 25MB \uC774\uD558 PNG/JPEG/WebP\uC5EC\uC57C \uD569\uB2C8\uB2E4.");
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && b.subarray(-8, -4).toString() === "IEND")
    return { mime: "image/png", ext: "png" };
  if (b[0] === 255 && b[1] === 216 && b.at(-2) === 255 && b.at(-1) === 217)
    return { mime: "image/jpeg", ext: "jpg" };
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" && b.readUInt32LE(4) + 8 === b.length)
    return { mime: "image/webp", ext: "webp" };
  return fail("INVALID_IMAGE", "\uC62C\uBC14\uB978 PNG/JPEG/WebP \uC774\uBBF8\uC9C0\uAC00 \uC544\uB2D9\uB2C8\uB2E4.");
}
class Assets {
  constructor(store) {
    this.store = store;
  }
  store;
  async import(projectId, source, revision) {
    let bytes, name;
    if ("path" in source) {
      const st = await stat(source.path);
      if (!st.isFile() || st.size > MAX_IMAGE)
        fail("INVALID_IMAGE", "25MB \uC774\uD558 \uC774\uBBF8\uC9C0 \uD30C\uC77C\uC744 \uC120\uD0DD\uD558\uC138\uC694.");
      bytes = await readFile(source.path);
      name = path.basename(source.path);
    } else {
      bytes = Buffer.from(source.bytes);
      name = path.basename(source.name);
    }
    const type = imageType(bytes);
    const asset = {
      id: randomUUID(),
      relativePath: "",
      mimeType: type.mime,
      byteLength: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      originalName: name
    };
    asset.relativePath = `assets/${asset.id}.${type.ext}`;
    const file = path.join(this.store.dir(projectId), asset.relativePath);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes, { flag: "wx", mode: 384 });
    try {
      const p = await this.store.mutate(projectId, revision, (p2) => {
        p2.assets.push(asset);
      });
      return { asset, revision: p.revision };
    } catch (e) {
      await unlink(file).catch(() => {
      });
      throw e;
    }
  }
  async read(projectId, assetId) {
    const p = await this.store.read(projectId);
    const asset = p.assets.find((a) => a.id === uuid(assetId));
    if (!asset) fail("MISSING_ASSET", "\uB4F1\uB85D\uB41C \uC774\uBBF8\uC9C0\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
    const root = await realpath(this.store.dir(projectId));
    let file;
    try {
      file = await realpath(path.resolve(root, asset.relativePath));
    } catch {
      fail("MISSING_ASSET", `\uC774\uBBF8\uC9C0 \uD30C\uC77C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4: ${asset.originalName}`);
    }
    if (!file.startsWith(root + path.sep))
      fail("INVALID_IMAGE", "\uD504\uB85C\uC81D\uD2B8 \uBC16 \uC774\uBBF8\uC9C0\uB294 \uC77D\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    const bytes = await readFile(file);
    if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256)
      fail("INVALID_IMAGE", "\uC800\uC7A5\uB41C \uC774\uBBF8\uC9C0\uAC00 \uBCC0\uACBD\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uB4F1\uB85D\uD558\uC138\uC694.");
    return { asset, bytes, path: file };
  }
  uploadDir(projectId, uploadId) {
    return path.join(this.store.dir(projectId), "uploads", uuid(uploadId));
  }
  async chunk(a) {
    await this.store.read(a.projectId);
    const b = Buffer.from(a.dataBase64, "base64");
    if (b.length > CHUNK || !b.length || a.index >= a.totalChunks || a.totalChunks > 100)
      fail("INVALID_IMAGE", "\uC774\uBBF8\uC9C0 \uC804\uC1A1 \uD06C\uAE30\uAC00 \uC798\uBABB\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
    const dir = this.uploadDir(a.projectId, a.uploadId);
    await mkdir(dir, { recursive: true });
    const meta = { name: a.name, totalChunks: a.totalChunks };
    try {
      await writeFile(path.join(dir, "meta.json"), JSON.stringify(meta), {
        flag: "wx"
      });
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      const saved = JSON.parse(
        await readFile(path.join(dir, "meta.json"), "utf8")
      );
      if (saved.name !== meta.name || saved.totalChunks !== meta.totalChunks)
        fail("REQUEST_CONFLICT", "\uC5C5\uB85C\uB4DC \uC815\uBCF4\uAC00 \uB2E4\uB985\uB2C8\uB2E4.");
    }
    const file = path.join(dir, String(a.index));
    try {
      await writeFile(file, b, { flag: "wx" });
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      if (!(await readFile(file)).equals(b))
        fail("REQUEST_CONFLICT", "\uB2E4\uB978 \uC774\uBBF8\uC9C0 \uC870\uAC01\uC774 \uC7AC\uC804\uC1A1\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
    }
    return { received: a.index };
  }
  async finish(projectId, uploadId, revision) {
    const dir = this.uploadDir(projectId, uploadId);
    const m = JSON.parse(await readFile(path.join(dir, "meta.json"), "utf8"));
    const chunks = [];
    for (let i = 0; i < m.totalChunks; i++) {
      try {
        chunks.push(await readFile(path.join(dir, String(i))));
      } catch {
        fail(
          "MISSING_ASSET",
          "\uC5C5\uB85C\uB4DC\uAC00 \uB05D\uB098\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uC774\uBBF8\uC9C0\uB97C \uB2E4\uC2DC \uC120\uD0DD\uD558\uC138\uC694."
        );
      }
    }
    return this.import(
      projectId,
      { bytes: Buffer.concat(chunks), name: m.name },
      revision
    );
  }
}
export {
  Assets,
  CHUNK,
  MAX_IMAGE,
  imageType
};
