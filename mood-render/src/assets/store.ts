import {
  readFile,
  writeFile,
  mkdir,
  stat,
  realpath,
  unlink,
  readdir,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { Store } from "../project/store.js";
import { type Asset, fail, uuid } from "../shared/contracts.js";
export const CHUNK = 256 * 1024,
  MAX_IMAGE = 25 * 1024 * 1024;
export function imageType(b: Buffer) {
  if (b.length < 16 || b.length > MAX_IMAGE)
    fail("INVALID_IMAGE", "이미지는 25MB 이하 PNG/JPEG/WebP여야 합니다.");
  if (
    b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    b.subarray(-8, -4).toString() === "IEND"
  )
    return { mime: "image/png", ext: "png" };
  if (b[0] === 255 && b[1] === 216 && b.at(-2) === 255 && b.at(-1) === 217)
    return { mime: "image/jpeg", ext: "jpg" };
  if (
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP" &&
    b.readUInt32LE(4) + 8 === b.length
  )
    return { mime: "image/webp", ext: "webp" };
  return fail("INVALID_IMAGE", "올바른 PNG/JPEG/WebP 이미지가 아닙니다.");
}
export class Assets {
  constructor(public store: Store) {}
  async import(
    projectId: string,
    source: { path: string } | { bytes: Uint8Array; name: string },
    revision: number,
  ) {
    let bytes: Buffer, name: string;
    if ("path" in source) {
      const st = await stat(source.path);
      if (!st.isFile() || st.size > MAX_IMAGE)
        fail("INVALID_IMAGE", "25MB 이하 이미지 파일을 선택하세요.");
      bytes = await readFile(source.path);
      name = path.basename(source.path);
    } else {
      bytes = Buffer.from(source.bytes);
      name = path.basename(source.name);
    }
    const type = imageType(bytes);
    const asset: Asset = {
      id: randomUUID(),
      relativePath: "",
      mimeType: type.mime,
      byteLength: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      originalName: name,
    };
    asset.relativePath = `assets/${asset.id}.${type.ext}`;
    const file = path.join(this.store.dir(projectId), asset.relativePath);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes, { flag: "wx", mode: 0o600 });
    try {
      const p = await this.store.mutate(projectId, revision, (p) => {
        p.assets.push(asset);
      });
      return { asset, revision: p.revision };
    } catch (e) {
      await unlink(file).catch(() => {});
      throw e;
    }
  }
  async read(projectId: string, assetId: string) {
    const p = await this.store.read(projectId);
    const asset = p.assets.find((a) => a.id === uuid(assetId));
    if (!asset) fail("MISSING_ASSET", "등록된 이미지가 없습니다.");
    const root = await realpath(this.store.dir(projectId));
    let file: string;
    try {
      file = await realpath(path.resolve(root, asset.relativePath));
    } catch {
      fail("MISSING_ASSET", `이미지 파일이 없습니다: ${asset.originalName}`);
    }
    if (!file.startsWith(root + path.sep))
      fail("INVALID_IMAGE", "프로젝트 밖 이미지는 읽을 수 없습니다.");
    const bytes = await readFile(file);
    if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256)
      fail("INVALID_IMAGE", "저장된 이미지가 변경되었습니다. 다시 등록하세요.");
    return { asset, bytes, path: file };
  }
  uploadDir(projectId: string, uploadId: string) {
    return path.join(this.store.dir(projectId), "uploads", uuid(uploadId));
  }
  async chunk(a: {
    projectId: string;
    uploadId: string;
    index: number;
    totalChunks: number;
    name: string;
    dataBase64: string;
  }) {
    await this.store.read(a.projectId);
    const b = Buffer.from(a.dataBase64, "base64");
    if (
      b.length > CHUNK ||
      !b.length ||
      a.index >= a.totalChunks ||
      a.totalChunks > 100
    )
      fail("INVALID_IMAGE", "이미지 전송 크기가 잘못되었습니다.");
    const dir = this.uploadDir(a.projectId, a.uploadId);
    await mkdir(dir, { recursive: true });
    const meta = { name: a.name, totalChunks: a.totalChunks };
    try {
      await writeFile(path.join(dir, "meta.json"), JSON.stringify(meta), {
        flag: "wx",
      });
    } catch (e: any) {
      if (e.code !== "EEXIST") throw e;
      const saved = JSON.parse(
        await readFile(path.join(dir, "meta.json"), "utf8"),
      );
      if (saved.name !== meta.name || saved.totalChunks !== meta.totalChunks)
        fail("REQUEST_CONFLICT", "업로드 정보가 다릅니다.");
    }
    const file = path.join(dir, String(a.index));
    try {
      await writeFile(file, b, { flag: "wx" });
    } catch (e: any) {
      if (e.code !== "EEXIST") throw e;
      if (!(await readFile(file)).equals(b))
        fail("REQUEST_CONFLICT", "다른 이미지 조각이 재전송되었습니다.");
    }
    return { received: a.index };
  }
  async finish(projectId: string, uploadId: string, revision: number) {
    const dir = this.uploadDir(projectId, uploadId);
    const m = JSON.parse(await readFile(path.join(dir, "meta.json"), "utf8"));
    const chunks: Buffer[] = [];
    for (let i = 0; i < m.totalChunks; i++) {
      try {
        chunks.push(await readFile(path.join(dir, String(i))));
      } catch {
        fail(
          "MISSING_ASSET",
          "업로드가 끝나지 않았습니다. 이미지를 다시 선택하세요.",
        );
      }
    }
    return this.import(
      projectId,
      { bytes: Buffer.concat(chunks), name: m.name },
      revision,
    );
  }
}
