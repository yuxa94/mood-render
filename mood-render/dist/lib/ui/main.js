import { connectHost } from "./bridge.js";
const $ = document.getElementById("app");
let bridge;
let mode = "", projects = [], p = null, dirty = false, busy = false, view = "board", mobile = "board", baseResultId, resultId = "", query = "", instruction = "";
let librarySearch = "", libraryCategory = "all", libraryStatus = "all";
const urls = /* @__PURE__ */ new Map();
const loading = /* @__PURE__ */ new Map();
let toastTimer;
const roleNames = {
  auto: "Auto",
  material: "\uC7AC\uB8CC",
  lighting: "\uC870\uBA85",
  color: "\uC0C9\uAC10",
  landscape: "\uC870\uACBD",
  furniture: "\uAC00\uAD6C",
  mood: "\uBD84\uC704\uAE30"
};
const statusNames = {
  prepared: "\uC900\uBE44",
  dispatched: "\uB300\uD654\uC5D0 \uC804\uB2EC",
  running: "\uC0DD\uC131 \uC911",
  "needs-result": "\uACB0\uACFC \uB4F1\uB85D \uD544\uC694",
  completed: "\uC644\uB8CC",
  failed: "\uC2E4\uD328"
};
function el(tag, cls = "", text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== void 0) e.textContent = text;
  return e;
}
function append(e, ...children) {
  for (const c of children) if (c !== void 0 && c !== null) e.append(c);
  return e;
}
function btn(text, fn, cls = "") {
  const b = el("button", cls, text);
  b.type = "button";
  b.onclick = () => void run(fn);
  return b;
}
function toast(message, error = false) {
  const t = document.getElementById("toast");
  t.textContent = message;
  t.className = `visible${error ? " error" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.className = "", error ? 1e4 : 4500);
}
async function run(fn) {
  if (busy) return;
  busy = true;
  document.body.classList.add("busy");
  try {
    await fn();
  } catch (e) {
    toast(e.message || "\uC791\uC5C5\uC744 \uC644\uB8CC\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", true);
  } finally {
    busy = false;
    document.body.classList.remove("busy");
  }
}
function changed() {
  dirty = true;
  document.querySelectorAll("[data-saved]").forEach((e) => e.textContent = "\uC800\uC7A5\uD558\uC9C0 \uC54A\uC740 \uBCC0\uACBD");
}
function textArea(value, placeholder, change) {
  const t = el("textarea");
  t.value = value;
  t.placeholder = placeholder;
  t.oninput = () => change(t.value);
  return t;
}
function field(label, control) {
  return append(el("label", "field"), el("span", "", label), control);
}
function empty(title, detail, cls = "") {
  return append(
    el("div", `empty ${cls}`),
    el("div", "empty-icon", "\u25A7"),
    el("strong", "", title),
    el("span", "", detail)
  );
}
function input(value, placeholder, change) {
  const i = el("input");
  i.value = value;
  i.placeholder = placeholder;
  i.oninput = () => change(i.value);
  return i;
}
async function call(name, args = {}) {
  return bridge.callTool(name, args);
}
async function load(id) {
  projects = await call("list_projects");
  if (id) p = await call("get_project", { projectId: id });
  else p = null;
  dirty = false;
  render();
}
async function refresh() {
  if (dirty) {
    if (!await confirmDialog(
      "\uC800\uC7A5\uD558\uC9C0 \uC54A\uC740 \uBCC0\uACBD\uC774 \uC788\uC2B5\uB2C8\uB2E4.",
      "\uD604\uC7AC \uD3B8\uC9D1\uC744 \uBC84\uB9AC\uACE0 \uC800\uC7A5\uB41C \uC0C1\uD0DC\uB97C \uBD88\uB7EC\uC62C\uAE4C\uC694?"
    ))
      return;
  }
  await load(p?.id);
  toast("\uCD5C\uC2E0 \uC0C1\uD0DC\uB97C \uBD88\uB7EC\uC654\uC2B5\uB2C8\uB2E4.");
}
function confirmDialog(title, message) {
  return new Promise((resolve) => {
    const d = el("dialog");
    append(d, el("h2", "", title), el("p", "", message));
    const actions = el("div", "dialog-actions");
    const cancel = el("button", "", "\uCDE8\uC18C"), ok = el("button", "primary", "\uACC4\uC18D");
    cancel.onclick = () => {
      d.close();
      d.remove();
      resolve(false);
    };
    ok.onclick = () => {
      d.close();
      d.remove();
      resolve(true);
    };
    append(actions, cancel, ok);
    d.append(actions);
    d.oncancel = () => {
      d.remove();
      resolve(false);
    };
    document.body.append(d);
    d.showModal();
  });
}
async function newProject() {
  if (dirty && !await confirmDialog(
    "\uC800\uC7A5\uD558\uC9C0 \uC54A\uC740 \uBCC0\uACBD\uC774 \uC788\uC2B5\uB2C8\uB2E4.",
    "\uD604\uC7AC \uD3B8\uC9D1\uC744 \uBC84\uB9AC\uACE0 \uC0C8 \uD504\uB85C\uC81D\uD2B8\uB97C \uB9CC\uB4E4\uAE4C\uC694?"
  ))
    return;
  await new Promise((resolve) => {
    const d = el("dialog");
    let name = "";
    const i = input("", "\uC608: \uC131\uC218\uB3D9 \uC8FC\uAC70 \uC678\uAD00", (v) => name = v);
    const cancel = el("button", "", "\uCDE8\uC18C"), ok = el("button", "primary", "\uD504\uB85C\uC81D\uD2B8 \uB9CC\uB4E4\uAE30");
    ok.onclick = async () => {
      if (!name.trim()) {
        i.focus();
        return;
      }
      ok.disabled = true;
      try {
        const next = await call("create_project", { name: name.trim() });
        d.close();
        d.remove();
        await load(next.id);
        resolve();
      } catch (e) {
        toast(e.message, true);
        ok.disabled = false;
      }
    };
    cancel.onclick = () => {
      d.close();
      d.remove();
      resolve();
    };
    append(
      d,
      el("h2", "", "\uC0C8 \uD504\uB85C\uC81D\uD2B8"),
      el(
        "p",
        "",
        "\uBAA8\uB378\uB9C1 \uC774\uBBF8\uC9C0, \uBB34\uB4DC\uBCF4\uB4DC, \uC0DD\uC131 \uACB0\uACFC\uB97C \uD558\uB098\uC758 \uD504\uB85C\uC81D\uD2B8\uC5D0 \uBCF4\uAD00\uD569\uB2C8\uB2E4."
      ),
      field("\uD504\uB85C\uC81D\uD2B8 \uC774\uB984", i),
      append(el("div", "dialog-actions"), cancel, ok)
    );
    d.oncancel = () => {
      d.remove();
      resolve();
    };
    document.body.append(d);
    d.showModal();
    i.focus();
  });
}
async function rename() {
  if (!p) return;
  if (dirty) await save();
  const d = el("dialog");
  let name = p.name;
  const i = input(name, "\uD504\uB85C\uC81D\uD2B8 \uC774\uB984", (v) => name = v);
  const ok = el("button", "primary", "\uC774\uB984 \uC800\uC7A5");
  ok.onclick = async () => {
    try {
      if (!p) return;
      p = await call("rename_project", {
        projectId: p.id,
        name,
        expectedRevision: p.revision
      });
      d.close();
      d.remove();
      projects = await call("list_projects");
      render();
    } catch (e) {
      toast(e.message, true);
    }
  };
  const close = el("button", "", "\uCDE8\uC18C");
  close.onclick = () => {
    d.close();
    d.remove();
  };
  append(
    d,
    el("h2", "", "\uD504\uB85C\uC81D\uD2B8 \uC774\uB984"),
    i,
    append(el("div", "dialog-actions"), close, ok)
  );
  document.body.append(d);
  d.showModal();
}
async function save() {
  if (!p) return;
  p = await call("save_board", {
    projectId: p.id,
    board: p.board,
    expectedRevision: p.revision
  });
  dirty = false;
  await bridge.updateContext(
    `Mood Render projectId=${p.id}, revision=${p.revision}. \uC0AC\uC6A9\uC790\uAC00 \uC120\uD0DD\uD55C \uCC38\uC870: ${p.board.items.map((i) => i.referenceId).join(", ")}. \uC804\uCCB4 \uD504\uB85C\uC81D\uD2B8\uB294 get_project\uB85C \uC77D\uC73C\uC138\uC694.`
  );
  render();
}
function pickFile(fn, multiple = false) {
  const i = el("input", "file-input");
  i.type = "file";
  i.accept = "image/png,image/jpeg,image/webp";
  i.multiple = multiple;
  i.onchange = () => {
    const files = [...i.files || []];
    i.remove();
    if (files.length) void run(() => fn(files));
  };
  document.body.append(i);
  i.click();
}
async function upload(f) {
  if (!p) throw Error("\uD504\uB85C\uC81D\uD2B8\uB97C \uBA3C\uC800 \uB9CC\uB4DC\uC138\uC694.");
  if (f.size > 25 * 1024 * 1024 || !f.size)
    throw Error("25MB \uC774\uD558 \uC774\uBBF8\uC9C0\uB97C \uC120\uD0DD\uD558\uC138\uC694.");
  const bitmap = await createImageBitmap(f).catch(() => {
    throw Error("\uC774\uBBF8\uC9C0 \uD30C\uC77C\uC744 \uC77D\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  });
  bitmap.close();
  const bytes = new Uint8Array(await f.arrayBuffer()), uploadId = crypto.randomUUID(), totalChunks = Math.ceil(bytes.length / 262144);
  for (let index = 0; index < totalChunks; index++) {
    const chunk = bytes.subarray(index * 262144, (index + 1) * 262144);
    let binary = "";
    for (let i = 0; i < chunk.length; i += 8192)
      binary += String.fromCharCode(...chunk.subarray(i, i + 8192));
    await call("upload_image_chunk", {
      projectId: p.id,
      uploadId,
      index,
      totalChunks,
      name: f.name,
      dataBase64: btoa(binary)
    });
  }
  const out = await call("finish_image_upload", {
    projectId: p.id,
    uploadId,
    expectedRevision: p.revision
  });
  p.revision = out.revision;
  p.assets.push(out.asset);
  return out.asset;
}
async function assetUrl(assetId, projectId = p.id) {
  const key = projectId + assetId;
  if (urls.has(key)) return urls.get(key);
  if (loading.has(key)) return loading.get(key);
  const promise = (async () => {
    const chunks = [];
    let total = 1, mime = "";
    for (let index = 0; index < total; index++) {
      const r = await call("read_image_chunk", { projectId, assetId, index });
      total = r.totalChunks;
      mime = r.mimeType;
      chunks.push(
        Uint8Array.from(atob(r.dataBase64), (c) => c.charCodeAt(0))
      );
    }
    const url = URL.createObjectURL(new Blob(chunks, { type: mime }));
    urls.set(key, url);
    return url;
  })();
  loading.set(key, promise);
  try {
    return await promise;
  } finally {
    loading.delete(key);
  }
}
function image(assetId, alt, cls = "") {
  const i = el("img", cls);
  i.alt = alt;
  void assetUrl(assetId).then((url) => i.src = url).catch((e) => {
    i.alt = "\uC774\uBBF8\uC9C0\uB97C \uBD88\uB7EC\uC62C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4";
    i.title = e.message;
  });
  return i;
}
async function addImages(files, referenceId) {
  if (dirty) await save();
  for (const f of files) {
    const a = await upload(f);
    if (referenceId) {
      p = await call("attach_reference_image", {
        projectId: p.id,
        referenceId,
        assetId: a.id,
        expectedRevision: p.revision
      });
    } else {
      p = await call("add_references", {
        projectId: p.id,
        expectedRevision: p.revision,
        items: [
          {
            title: f.name,
            sourceUrl: "",
            reason: "\uC9C1\uC811 \uB4F1\uB85D\uD55C \uB808\uD37C\uB7F0\uC2A4",
            category: "mood",
            assetId: a.id
          }
        ]
      });
    }
  }
  render();
  toast("\uB808\uD37C\uB7F0\uC2A4 \uC774\uBBF8\uC9C0\uB97C \uB4F1\uB85D\uD588\uC2B5\uB2C8\uB2E4.");
}
async function setSource(files) {
  if (dirty) await save();
  const a = await upload(files[0]);
  p = await call("set_source", {
    projectId: p.id,
    assetId: a.id,
    expectedRevision: p.revision
  });
  render();
  toast("\uC6D0\uBCF8 \uC774\uBBF8\uC9C0\uB97C \uB4F1\uB85D\uD588\uC2B5\uB2C8\uB2E4.");
}
function toggle(r) {
  if (!p) return;
  const index = p.board.items.findIndex((i) => i.referenceId === r.id);
  if (index >= 0) p.board.items.splice(index, 1);
  else
    p.board.items.push({
      referenceId: r.id,
      roles: ["auto"],
      target: "",
      note: ""
    });
  changed();
  render();
}
function move(id, to) {
  if (!p) return;
  const i = p.board.items.findIndex((i2) => i2.referenceId === id);
  if (i < 0) return;
  const [item] = p.board.items.splice(i, 1);
  p.board.items.splice(
    Math.max(0, Math.min(to, p.board.items.length)),
    0,
    item
  );
  changed();
  render();
}
async function sendOrCopy(text, title) {
  const state = await bridge.sendMessage(text);
  if (state === "sent") {
    toast("Codex \uB300\uD654\uC5D0 \uC694\uCCAD\uC744 \uC804\uB2EC\uD588\uC2B5\uB2C8\uB2E4.");
    return true;
  }
  const d = el("dialog");
  const t = textArea(text, "", () => {
  });
  t.readOnly = true;
  const copy = el("button", "primary", "\uC2E4\uD589\uBB38 \uBCF5\uC0AC");
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      copy.textContent = "\uBCF5\uC0AC\uB428";
    } catch {
      t.select();
      document.execCommand("copy");
      copy.textContent = "\uBCF5\uC0AC\uB428";
    }
  };
  const close = el("button", "", "\uB2EB\uAE30");
  close.onclick = () => {
    d.close();
    d.remove();
  };
  append(
    d,
    el("h2", "", title),
    el(
      "p",
      "",
      state === "failed" ? "\uB300\uD654 \uC804\uB2EC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uC544\uB798 \uC2E4\uD589\uBB38\uC744 Codex \uB300\uD654\uC5D0 \uBD99\uC5EC\uB123\uC73C\uC138\uC694." : "\uC544\uB798 \uC2E4\uD589\uBB38\uC744 \uC774 \uD504\uB85C\uC81D\uD2B8\uC758 Codex \uB300\uD654\uC5D0 \uBD99\uC5EC\uB123\uC73C\uC138\uC694. \uC800\uC7A5\uB41C \uC774\uBBF8\uC9C0\uC640 \uC124\uC815\uC744 \uC774\uC5B4\uC11C \uC0AC\uC6A9\uD569\uB2C8\uB2E4."
    ),
    t,
    append(el("div", "dialog-actions"), close, copy)
  );
  document.body.append(d);
  d.showModal();
  return false;
}
function requestText(job) {
  return `Mood Render \uD50C\uB7EC\uADF8\uC778\uC758 render-from-moodboard \uC2A4\uD0AC\uB85C \uC2E4\uC0AC\uD654\uD574\uC918. projectId=${p.id}, jobId=${job.id}. get_render\uB85C \uC800\uC7A5\uB41C \uC785\uB825\uACFC \uC9C0\uC2DC\uC11C\uB97C \uC77D\uACE0 \uBAA8\uB4E0 \uC2E4\uC81C \uC774\uBBF8\uC9C0\uB97C \uD655\uC778\uD55C \uB2E4\uC74C Codex \uB0B4\uC7A5 \uC774\uBBF8\uC9C0 \uB3C4\uAD6C\uB9CC \uC0AC\uC6A9\uD574\uC918. \uACB0\uACFC\uB97C \uD504\uB85C\uC81D\uD2B8\uC5D0 \uC0C8 \uBC84\uC804\uC73C\uB85C \uB4F1\uB85D\uD558\uACE0 \uC6D0\uBCF8\uACFC \uBE44\uAD50\uD574\uC918. \uD50C\uB7EC\uADF8\uC778 \uB3C4\uAD6C\uAC00 \uD604\uC7AC \uB300\uD654\uC5D0 \uC5C6\uC73C\uBA74 \uC124\uCE58\uB41C mood-render \uC2A4\uD0AC\uC758 \uB85C\uCEEC CLI \uACBD\uB85C\uB85C \uC791\uC5C5\uC744 \uC774\uC5B4\uAC00\uC918. API\uB294 \uC0AC\uC6A9\uD558\uC9C0 \uB9C8.`;
}
async function research() {
  if (!p) return;
  if (dirty) await save();
  const text = `Mood Render reference-research \uC2A4\uD0AC\uB85C projectId=${p.id}\uC758 \uC6D0\uBCF8\uC744 \uD655\uC778\uD558\uACE0 \uB808\uD37C\uB7F0\uC2A4 \uC57D 12\uAC1C\uB97C \uCC3E\uC544 UI\uC5D0 \uB4F1\uB85D\uD574\uC918. \uC6D0\uD558\uB294 \uBC29\uD5A5: ${query || p.board.direction || "\uC6D0\uBCF8 \uACF5\uAC04\uACFC \uC5B4\uC6B8\uB9AC\uB294 \uC7AC\uB8CC\uC640 \uC870\uBA85"}. \uCD9C\uCC98\uC640 \uCC38\uACE0 \uC774\uC720\uB97C \uAE30\uB85D\uD558\uACE0 \uC2E4\uC81C \uD655\uC778\uD55C \uC774\uBBF8\uC9C0\uB85C \uBBF8\uB9AC\uBCF4\uAE30\uB97C \uB9CC\uB4E4\uC5B4\uC918. \uC815\uCC45\uC0C1 \uC774\uBBF8\uC9C0 \uD655\uBCF4\uAC00 \uBD88\uAC00\uB2A5\uD558\uBA74 \uB9C1\uD06C\uC640 \uC0C1\uD0DC\uB97C \uAE30\uB85D\uD574\uC918. \uC120\uD0DD\uC740 \uB0B4\uAC00 \uD560\uAC8C. \uB3C4\uAD6C\uAC00 \uC5C6\uC73C\uBA74 \uC124\uCE58\uB41C \uC2A4\uD0AC\uC758 \uB85C\uCEEC CLI\uB97C \uC0AC\uC6A9\uD574\uC918.`;
  await sendOrCopy(text, "\uB808\uD37C\uB7F0\uC2A4 \uAC80\uC0C9 \uC694\uCCAD");
}
async function prepare() {
  if (!p) return;
  if (dirty) await save();
  const r = await call("prepare_render", {
    projectId: p.id,
    expectedRevision: p.revision,
    clientRequestId: crypto.randomUUID(),
    ...baseResultId ? { baseResultId } : {},
    instruction
  });
  p = await call("get_project", { projectId: p.id });
  render();
  if (await sendOrCopy(requestText(r.job), "\uC2E4\uC0AC\uD654 \uC694\uCCAD")) {
    await call("set_render_status", {
      projectId: p.id,
      jobId: r.job.id,
      status: "dispatched"
    });
    p = await call("get_project", { projectId: p.id });
    render();
  }
}
function top() {
  const header = el("header", "topbar");
  append(
    header,
    append(el("div", "brand"), el("div", "mark"), el("h1", "", "Mood Render")),
    el(
      "span",
      "mode",
      mode === "codex" ? "Codex \uC5F0\uACB0" : "\uB85C\uCEEC \uC2A4\uD29C\uB514\uC624 \xB7 \uC694\uCCAD\uBB38 \uBCF5\uC0AC"
    )
  );
  const select = el("select", "project-picker");
  select.setAttribute("aria-label", "\uD504\uB85C\uC81D\uD2B8 \uC120\uD0DD");
  append(select, new Option("\uD504\uB85C\uC81D\uD2B8 \uC120\uD0DD", ""));
  for (const a of projects) select.add(new Option(a.name, a.id));
  select.value = p?.id || "";
  select.onchange = () => void run(async () => {
    if (dirty && !await confirmDialog(
      "\uC800\uC7A5\uD558\uC9C0 \uC54A\uC740 \uBCC0\uACBD",
      "\uD604\uC7AC \uD3B8\uC9D1\uC744 \uBC84\uB9AC\uACE0 \uD504\uB85C\uC81D\uD2B8\uB97C \uBCC0\uACBD\uD560\uAE4C\uC694?"
    )) {
      select.value = p?.id || "";
      return;
    }
    baseResultId = void 0;
    await load(select.value || void 0);
  });
  append(
    header,
    select,
    btn("\uC0C8 \uD504\uB85C\uC81D\uD2B8", newProject),
    btn("\uC0C8\uB85C\uACE0\uCE68", refresh, "ghost")
  );
  return header;
}
function welcome() {
  const w = el("main", "welcome");
  const a = el("div");
  append(
    a,
    el("h2", "", "\uBAA8\uB378\uC758 \uD615\uD0DC\uC5D0,\n\uC6D0\uD558\uB294 \uBD84\uC704\uAE30\uB97C."),
    el(
      "p",
      "",
      "3D \uC774\uBBF8\uC9C0\uC5D0\uC11C \uC2DC\uC791\uD574 \uB808\uD37C\uB7F0\uC2A4\uB97C \uACE0\uB974\uACE0, \uC7AC\uB8CC\uC640 \uBE5B\uC744 \uC815\uB9AC\uD558\uC138\uC694. \uC644\uC131\uB41C \uBB34\uB4DC\uBCF4\uB4DC\uB97C Codex\uC5D0 \uC804\uB2EC\uD574 \uC2E4\uC0AC \uC774\uBBF8\uC9C0\uB97C \uB9CC\uB4ED\uB2C8\uB2E4."
    ),
    btn("\uCCAB \uD504\uB85C\uC81D\uD2B8 \uB9CC\uB4E4\uAE30", newProject, "primary")
  );
  const flow = el("div", "flow");
  [
    ["1", "\uC6D0\uBCF8 \uC774\uBBF8\uC9C0", "\uBAA8\uB378\uB9C1 \uD654\uBA74 \uB610\uB294 \uB80C\uB354 \uC774\uBBF8\uC9C0\uB97C \uB4F1\uB85D\uD569\uB2C8\uB2E4."],
    ["2", "\uB808\uD37C\uB7F0\uC2A4\uC640 \uBB34\uB4DC\uBCF4\uB4DC", "\uC774\uBBF8\uC9C0\uB97C \uACE0\uB974\uACE0 \uCC38\uACE0\uD560 \uC694\uC18C\uB97C \uC9C0\uC815\uD569\uB2C8\uB2E4."],
    ["3", "\uC2E4\uC0AC\uD654\uC640 \uBE44\uAD50", "\uC6D0\uBCF8\uC758 \uD615\uD0DC\uB97C \uAE30\uC900\uC73C\uB85C \uC0C8 \uACB0\uACFC\uB97C \uB9CC\uB4ED\uB2C8\uB2E4."]
  ].forEach(
    ([n, t, d]) => flow.append(
      append(
        el("article"),
        el("span", "step", n),
        append(el("div"), el("h3", "", t), el("p", "", d))
      )
    )
  );
  append(
    w,
    a,
    flow,
    el(
      "p",
      "welcome-foot",
      "PNG \xB7 JPEG \xB7 WebP / \uD30C\uC77C\uB2F9 25MB \uC774\uD558 / \uD504\uB85C\uC81D\uD2B8\uB294 \uC774 \uCEF4\uD4E8\uD130\uC5D0 \uC800\uC7A5\uB429\uB2C8\uB2E4."
    )
  );
  return w;
}
const categoryNames = {
  material: "\uC7AC\uB8CC",
  lighting: "\uC870\uBA85",
  color: "\uC0C9\uAC10",
  landscape: "\uC870\uACBD",
  furniture: "\uAC00\uAD6C",
  mood: "\uBD84\uC704\uAE30"
};
function gallery(expanded = false) {
  const pane = el(
    "section",
    `pane gallery-pane ${expanded ? "expanded" : ""} ${mobile === "gallery" ? "mobile-visible" : ""}`
  );
  append(
    pane,
    append(
      el("div", "pane-heading"),
      el("h2", "", "\uB808\uD37C\uB7F0\uC2A4"),
      el("small", "", `${p.references.length}\uAC1C \xB7 ${p.board.items.length}\uAC1C \uC120\uD0DD`),
      btn("+ \uC774\uBBF8\uC9C0", () => pickFile((f) => addImages(f), true), "ghost")
    ),
    el(
      "p",
      "pane-intro",
      expanded ? "\uC0AC\uC9C4\uC744 \uBE44\uAD50\uD574 \uC6D0\uD558\uB294 \uD6C4\uBCF4\uB97C \uACE0\uB974\uC138\uC694. \uC120\uD0DD \uB0B4\uC6A9\uC740 \uBB34\uB4DC\uBCF4\uB4DC\uC5D0 \uB2F4\uAE41\uB2C8\uB2E4." : "\uC6D0\uD558\uB294 \uC774\uBBF8\uC9C0\uB97C \uACE8\uB77C \uBB34\uB4DC\uBCF4\uB4DC\uC5D0 \uB2F4\uC73C\uC138\uC694."
    )
  );
  if (!expanded)
    pane.append(
      btn("\uB77C\uC774\uBE0C\uB7EC\uB9AC \uD06C\uAC8C \uBCF4\uAE30", () => {
        view = "library";
        render();
      }, "library-open")
    );
  else
    pane.append(
      btn("\uBB34\uB4DC\uBCF4\uB4DC\uB85C \uB3CC\uC544\uAC00\uAE30", () => {
        view = "board";
        render();
      }, "ghost library-back")
    );
  const search = el("div", "search-box");
  append(
    search,
    textArea(
      query,
      "\uC608: \uBC1D\uC740 \uC11D\uC7AC, \uAE4A\uC740 \uCC3D\uD638, \uD750\uB9B0 \uB0A0\uC758 \uBD80\uB4DC\uB7EC\uC6B4 \uBE5B",
      (v) => query = v
    ),
    btn("Codex\uC5D0 \uB808\uD37C\uB7F0\uC2A4 \uAC80\uC0C9 \uC694\uCCAD", research)
  );
  if (expanded)
    pane.append(
      append(
        el("details", "research-disclosure"),
        el("summary", "", "\uC0C8 \uB808\uD37C\uB7F0\uC2A4 \uCC3E\uAE30"),
        search
      )
    );
  else pane.append(search);
  const filters = el("div", "library-filters");
  const find = input(librarySearch, "\uC81C\uBAA9\xB7\uCC38\uACE0 \uC774\uC720 \uAC80\uC0C9", (value) => {
    librarySearch = value;
    updateGalleryFilter();
  });
  find.type = "search";
  find.setAttribute("aria-label", "\uB808\uD37C\uB7F0\uC2A4 \uAC80\uC0C9");
  const category = el("select");
  category.setAttribute("aria-label", "\uBD84\uC57C \uD544\uD130");
  category.add(new Option("\uBAA8\uB4E0 \uBD84\uC57C", "all"));
  for (const [key, label] of Object.entries(categoryNames))
    category.add(new Option(label, key));
  category.value = libraryCategory;
  category.onchange = () => {
    libraryCategory = category.value;
    updateGalleryFilter();
  };
  const status = el("select");
  status.setAttribute("aria-label", "\uC0C1\uD0DC \uD544\uD130");
  for (const [label, key] of [
    ["\uC804\uCCB4 \uD6C4\uBCF4", "all"],
    ["\uC120\uD0DD\uD55C \uC774\uBBF8\uC9C0", "selected"],
    ["\uBBF8\uB9AC\uBCF4\uAE30 \uC788\uC74C", "ready"],
    ["\uC774\uBBF8\uC9C0 \uC5F0\uACB0 \uD544\uC694", "link-only"]
  ]) status.add(new Option(label, key));
  status.value = libraryStatus;
  status.onchange = () => {
    libraryStatus = status.value;
    updateGalleryFilter();
  };
  append(filters, find, category, status);
  pane.append(filters);
  const count = el("p", "filter-count");
  count.setAttribute("aria-live", "polite");
  pane.append(count);
  const grid = el("div", "ref-grid");
  if (!p.references.length)
    grid.append(
      empty(
        "\uC544\uC9C1 \uB808\uD37C\uB7F0\uC2A4\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4",
        "\uAC80\uC0C9\uC744 \uC694\uCCAD\uD558\uAC70\uB098 \uAC00\uC9C0\uACE0 \uC788\uB294 \uC774\uBBF8\uC9C0\uB97C \uB4F1\uB85D\uD558\uC138\uC694.",
        "wide"
      )
    );
  for (const r of p.references) {
    const selected = p.board.items.some((i) => i.referenceId === r.id);
    const card = el("article", `reference ${selected ? "selected" : ""}`);
    card.dataset.search = `${r.title} ${r.reason}`.toLocaleLowerCase();
    card.dataset.category = r.category;
    card.dataset.selected = String(selected);
    card.dataset.ready = String(!!r.assetId);
    const media = el("div", "ref-media");
    if (r.assetId) media.append(image(r.assetId, r.title));
    else media.append(el("small", "", "\uC774\uBBF8\uC9C0 \uB4F1\uB85D \uD544\uC694"));
    const select = btn(selected ? "\u2713" : "+", () => toggle(r), "select-ref");
    if (!r.assetId && !selected) {
      select.disabled = true;
      select.title = "\uC774\uBBF8\uC9C0\uB97C \uC5F0\uACB0\uD55C \uB4A4 \uC120\uD0DD\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.";
    }
    select.setAttribute(
      "aria-label",
      `${r.title} ${selected ? "\uC120\uD0DD \uD574\uC81C" : "\uC120\uD0DD"}`
    );
    select.setAttribute("aria-pressed", String(selected));
    append(card, media, select, el("h3", "", r.title), el("p", "ref-reason", r.reason));
    const acts = el("div", "ref-actions");
    if (r.sourceUrl)
      acts.append(btn("\uCD9C\uCC98", () => bridge.openLink(r.sourceUrl)));
    if (!r.assetId)
      acts.append(
        btn("\uC774\uBBF8\uC9C0 \uC5F0\uACB0", () => pickFile((f) => addImages(f, r.id)))
      );
    card.append(acts);
    grid.append(card);
  }
  pane.append(grid);
  const noMatches = el("p", "filter-empty", "\uC870\uAC74\uC5D0 \uB9DE\uB294 \uB808\uD37C\uB7F0\uC2A4\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uAC80\uC0C9\uC5B4\uB098 \uD544\uD130\uB97C \uBC14\uAFD4\uBCF4\uC138\uC694.");
  pane.append(noMatches);
  queueMicrotask(() => updateGalleryFilter());
  return pane;
}
function updateGalleryFilter() {
  const term = librarySearch.trim().toLocaleLowerCase();
  for (const pane of document.querySelectorAll(".gallery-pane")) {
    const cards = [...pane.querySelectorAll(".reference")];
    let visible = 0;
    for (const card of cards) {
      const matches = (!term || (card.dataset.search || "").includes(term)) && (libraryCategory === "all" || card.dataset.category === libraryCategory) && (libraryStatus === "all" || libraryStatus === "selected" && card.dataset.selected === "true" || libraryStatus === "ready" && card.dataset.ready === "true" || libraryStatus === "link-only" && card.dataset.ready === "false");
      card.hidden = !matches;
      if (matches) visible++;
    }
    const count = pane.querySelector(".filter-count");
    if (count) count.textContent = `${visible} / ${cards.length}\uAC1C \uD45C\uC2DC`;
    const empty2 = pane.querySelector(".filter-empty");
    if (empty2) empty2.hidden = visible !== 0 || cards.length === 0;
  }
}
function board() {
  const pane = el(
    "section",
    `pane board-pane ${mobile === "board" ? "mobile-visible" : ""}`
  );
  append(
    pane,
    append(
      el("div", "pane-heading"),
      el("h2", "", "\uBB34\uB4DC\uBCF4\uB4DC"),
      el("small", "", `${p.board.items.length}\uAC1C \uC120\uD0DD`)
    ),
    el(
      "p",
      "pane-intro",
      "\uC774\uBBF8\uC9C0\uB9CC \uACE0\uB974\uBA74 Auto\uAC00 \uCC38\uACE0\uD560 \uC694\uC18C\uB97C \uD310\uB2E8\uD569\uB2C8\uB2E4. \uD544\uC694\uD560 \uB54C \uC9C1\uC811 \uC9C0\uC815\uD558\uC138\uC694."
    )
  );
  if (!p.board.items.length)
    pane.append(
      empty(
        "\uC120\uD0DD\uD55C \uC774\uBBF8\uC9C0\uAC00 \uC774\uACF3\uC5D0 \uBAA8\uC785\uB2C8\uB2E4",
        "\uC7AC\uB8CC, \uBE5B, \uC0C9\uAC10\uC774 \uC11C\uB85C \uC5B4\uC6B8\uB9AC\uB294 \uC774\uBBF8\uC9C0\uBD80\uD130 \uACE8\uB77C\uBCF4\uC138\uC694.",
        "board-empty"
      )
    );
  p.board.items.forEach((item, index) => {
    const r = p.references.find((r2) => r2.id === item.referenceId);
    const card = el("article", "board-card");
    card.draggable = true;
    card.ondragstart = (e) => {
      e.dataTransfer?.setData("text/plain", item.referenceId);
      card.classList.add("dragging");
    };
    card.ondragend = () => card.classList.remove("dragging");
    card.ondragover = (e) => e.preventDefault();
    card.ondrop = (e) => {
      e.preventDefault();
      move(e.dataTransfer?.getData("text/plain") || "", index);
    };
    const title = append(
      el("div", "board-card-header"),
      el("span", "index", String(index + 1)),
      el("strong", "grow", r.title),
      btn("\u2191", () => move(item.referenceId, index - 1)),
      btn("\u2193", () => move(item.referenceId, index + 1)),
      btn("\xD7", () => toggle(r))
    );
    const body = el("div", "board-card-body");
    if (r.assetId) body.append(image(r.assetId, r.title, "board-image"));
    else body.append(empty("\uC774\uBBF8\uC9C0 \uD544\uC694", "\uD6C4\uBCF4\uC5D0\uC11C \uC774\uBBF8\uC9C0\uB97C \uC5F0\uACB0\uD558\uC138\uC694."));
    const settings = el("div");
    const roles = el("div", "roles");
    for (const [key, label] of Object.entries(roleNames)) {
      const b = btn(
        label,
        () => {
          const rs = item.roles;
          if (key === "auto") item.roles = ["auto"];
          else {
            const explicit = item.roles.filter((v) => v !== "auto");
            item.roles = rs.includes(key) ? explicit.filter((v) => v !== key) : [...explicit, key];
            if (!item.roles.length) item.roles = ["auto"];
          }
          changed();
          render();
        },
        `role ${item.roles.includes(key) ? "on" : ""}`
      );
      b.setAttribute("aria-pressed", String(item.roles.includes(key)));
      roles.append(b);
    }
    append(
      settings,
      roles,
      el("p", "muted", "Auto\uB294 \uCC38\uACE0\uD560 \uC694\uC18C\uC640 \uC801\uC6A9 \uB300\uC0C1\uC744 \uC774\uBBF8\uC9C0\uC5D0\uC11C \uC790\uB3D9\uC73C\uB85C \uD310\uB2E8\uD569\uB2C8\uB2E4."),
      input(item.target, "\uC801\uC6A9 \uB300\uC0C1 (\uC120\uD0DD \uC0AC\uD56D \xB7 \uBE44\uC6B0\uBA74 \uC790\uB3D9)", (v) => {
        item.target = v;
        changed();
      }),
      textArea(item.note, "\uCC38\uACE0\uD560 \uBD80\uBD84 (\uC120\uD0DD \uC0AC\uD56D \xB7 \uBE44\uC6B0\uBA74 \uC790\uB3D9)", (v) => {
        item.note = v;
        changed();
      })
    );
    append(body, settings);
    append(card, title, body);
    pane.append(card);
  });
  append(
    pane,
    field(
      "\uC804\uCCB4 \uBD84\uC704\uAE30",
      textArea(
        p.board.direction,
        "\uC7AC\uB8CC\uC640 \uBE5B, \uC0C9\uAC10\uC758 \uACF5\uD1B5 \uBC29\uD5A5\uC744 \uC801\uC5B4\uC8FC\uC138\uC694.",
        (v) => {
          p.board.direction = v;
          changed();
        }
      )
    ),
    append(
      el("div", "board-footer"),
      el(
        "small",
        "",
        dirty ? "\uC800\uC7A5\uD558\uC9C0 \uC54A\uC740 \uBCC0\uACBD" : "\uBCC0\uACBD\uC0AC\uD56D\uC744 \uC800\uC7A5\uD558\uBA74 \uB2E4\uC74C \uC791\uC5C5\uC5D0\uB3C4 \uC774\uC5B4\uC9D1\uB2C8\uB2E4."
      ),
      btn(
        "\uBB34\uB4DC\uBCF4\uB4DC \uC800\uC7A5",
        async () => {
          await save();
          toast("\uBB34\uB4DC\uBCF4\uB4DC\uB97C \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.");
        },
        "primary"
      )
    )
  );
  return pane;
}
function renderPane() {
  const pane = el(
    "section",
    `pane ${mobile === "render" ? "mobile-visible" : ""}`
  );
  append(
    pane,
    el("h2", "", "\uC2E4\uC0AC\uD654"),
    el("p", "pane-intro", "\uC6D0\uBCF8\uC758 \uAD6C\uB3C4\uC640 \uD615\uD0DC\uC5D0 \uC120\uD0DD\uD55C \uBB34\uB4DC\uB97C \uC801\uC6A9\uD569\uB2C8\uB2E4.")
  );
  const src = el("div", "source-box");
  if (p.sourceAssetId) src.append(image(p.sourceAssetId, "\uC6D0\uBCF8 3D \uC774\uBBF8\uC9C0"));
  else
    src.append(
      empty("\uC6D0\uBCF8 3D \uC774\uBBF8\uC9C0", "\uBAA8\uB378\uB9C1 \uD654\uBA74 \uB610\uB294 \uB80C\uB354 \uC774\uBBF8\uC9C0\uB97C \uB4F1\uB85D\uD558\uC138\uC694.")
    );
  append(
    pane,
    src,
    btn(
      p.sourceAssetId ? "\uC6D0\uBCF8 \uC774\uBBF8\uC9C0 \uBCC0\uACBD" : "\uC6D0\uBCF8 \uC774\uBBF8\uC9C0 \uB4F1\uB85D",
      () => pickFile(setSource),
      "source-upload"
    ),
    el("label", "field", "\uC6D0\uBCF8\uC5D0\uC11C \uC720\uC9C0\uD560 \uC694\uC18C")
  );
  const checks = el("div", "checks");
  for (const [key, label] of Object.entries({
    camera: "\uCE74\uBA54\uB77C\xB7\uAD6C\uB3C4",
    structure: "\uB9E4\uC2A4\xB7\uBCBD\uCCB4",
    openings: "\uCC3D\uD638\xB7\uAC1C\uAD6C\uBD80",
    furniture: "\uAC00\uAD6C \uBC30\uCE58"
  })) {
    const i = el("input");
    i.type = "checkbox";
    i.checked = p.board.preserve[key];
    i.onchange = () => {
      p.board.preserve[key] = i.checked;
      changed();
    };
    checks.append(append(el("label"), i, label));
  }
  pane.append(checks);
  if (baseResultId)
    append(
      pane,
      el("small", "", "\uC120\uD0DD\uD55C \uACB0\uACFC\uB97C \uC218\uC815\uD558\uB294 \uC911"),
      btn(
        "\uC6D0\uBCF8\uBD80\uD130 \uC0DD\uC131",
        () => {
          baseResultId = void 0;
          render();
        },
        "ghost"
      )
    );
  append(
    pane,
    field(
      "\uCD94\uAC00 \uC694\uCCAD",
      textArea(
        instruction,
        "\uC608: \uC870\uACBD\uC740 \uC808\uC81C\uD558\uACE0 \uC11D\uC7AC \uC9C8\uAC10\uC744 \uAC15\uC870\uD574\uC918",
        (v) => instruction = v
      )
    ),
    append(
      el("div", "render-action"),
      btn(
        baseResultId ? "\uC120\uD0DD \uACB0\uACFC \uC218\uC815 \uC694\uCCAD" : "\uC774 \uBB34\uB4DC\uB85C \uC2E4\uC0AC\uD654",
        prepare,
        "primary"
      ),
      el(
        "p",
        "muted",
        mode === "codex" ? "\uC120\uD0DD\uD55C \uC774\uBBF8\uC9C0\uC640 \uC9C0\uC2DC\uC11C\uB97C Codex \uB300\uD654\uC5D0 \uC804\uB2EC\uD569\uB2C8\uB2E4." : "\uC694\uCCAD\uBB38\uC744 \uBCF5\uC0AC\uD574 Codex \uB300\uD654\uC5D0 \uBD99\uC5EC\uB123\uC73C\uBA74 \uC774\uC5B4\uC11C \uC0DD\uC131\uD569\uB2C8\uB2E4."
      )
    )
  );
  const jobs = el("div", "jobs");
  if (p.jobs.length) jobs.append(el("h3", "", "\uCD5C\uADFC \uC791\uC5C5"));
  for (const j of [...p.jobs].reverse().slice(0, 5)) {
    const line = el("article", "job");
    append(
      line,
      append(
        el("div", "row"),
        el("span", "status grow", statusNames[j.status]),
        el(
          "small",
          "",
          new Date(j.createdAt).toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit"
          })
        )
      )
    );
    if (j.error) line.append(el("p", "error", j.error));
    const actions = el("div", "row");
    if (["prepared", "dispatched"].includes(j.status))
      actions.append(
        btn(
          "\uC694\uCCAD\uBB38 \uBCF4\uAE30",
          () => sendOrCopy(requestText(j), "\uC800\uC7A5\uB41C \uC2E4\uC0AC\uD654 \uC694\uCCAD")
        )
      );
    if (["running", "needs-result"].includes(j.status))
      actions.append(
        btn("\uACB0\uACFC \uC774\uBBF8\uC9C0 \uB4F1\uB85D", () => pickFile((f) => registerFile(j, f[0])))
      );
    if (["dispatched", "running"].includes(j.status))
      actions.append(
        btn(
          "\uC0C1\uD0DC \uD655\uC778 \uC694\uCCAD",
          () => sendOrCopy(
            `Mood Render projectId=${p.id}, jobId=${j.id} \uC791\uC5C5 \uC0C1\uD0DC\uB97C \uD655\uC778\uD574\uC918. get_render\uB97C \uC77D\uACE0, \uC774\uBBF8 \uC2E4\uD589\uD55C \uC791\uC5C5\uC740 \uC911\uBCF5 \uC0DD\uC131\uD558\uC9C0 \uB9D0\uACE0 \uACB0\uACFC\uB97C \uB4F1\uB85D\uD558\uAC70\uB098 \uC2E4\uD328 \uC6D0\uC778\uC744 \uAE30\uB85D\uD574\uC918.`,
            "\uC791\uC5C5 \uC0C1\uD0DC \uD655\uC778"
          )
        )
      );
    if (j.status === "completed")
      actions.append(
        btn("\uACB0\uACFC \uBCF4\uAE30", () => {
          resultId = p.results.find((r) => r.jobId === j.id)?.id || "";
          view = "results";
          render();
        })
      );
    line.append(actions);
    jobs.append(line);
  }
  pane.append(jobs);
  return pane;
}
async function registerFile(job, file) {
  if (dirty) await save();
  const a = await upload(file);
  const r = await call("register_result", {
    projectId: p.id,
    jobId: job.id,
    assetId: a.id,
    note: "\uC0AC\uC6A9\uC790\uAC00 \uC800\uC7A5\uD55C \uACB0\uACFC \uC774\uBBF8\uC9C0",
    reviewNote: "\uD615\uD0DC \uBE44\uAD50 \uC804"
  });
  p = r.project;
  resultId = r.result.id;
  view = "results";
  render();
  toast("\uACB0\uACFC \uC774\uBBF8\uC9C0\uB97C \uB4F1\uB85D\uD588\uC2B5\uB2C8\uB2E4.");
}
function results() {
  const main = el("main", "results-view");
  append(
    main,
    append(
      el("div", "pane-heading"),
      el("h2", "", "\uC6D0\uBCF8\uACFC \uACB0\uACFC \uBE44\uAD50"),
      el("small", "", `${p.results.length}\uAC1C \uACB0\uACFC`)
    )
  );
  if (!p.results.length) {
    main.append(
      empty(
        "\uC544\uC9C1 \uC0DD\uC131 \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4",
        "\uBB34\uB4DC\uBCF4\uB4DC\uB97C \uC800\uC7A5\uD558\uACE0 \uC2E4\uC0AC\uD654\uB97C \uC694\uCCAD\uD558\uC138\uC694."
      )
    );
    return main;
  }
  const select = el("select");
  for (const [i, r2] of p.results.entries())
    select.add(
      new Option(
        `\uBC84\uC804 ${i + 1} \u2014 ${new Date(r2.createdAt).toLocaleString("ko-KR")}`,
        r2.id
      )
    );
  const r = p.results.find((r2) => r2.id === resultId) || p.results.at(-1);
  resultId = r.id;
  select.value = r.id;
  select.onchange = () => {
    resultId = select.value;
    render();
  };
  const resultActions = el("div", "result-toolbar");
  append(
    resultActions,
    select,
    btn("\uACB0\uACFC \uC774\uBBF8\uC9C0 \uC800\uC7A5", async () => {
      const asset = p.assets.find((a2) => a2.id === r.assetId);
      const ext = asset?.mimeType === "image/jpeg" ? "jpg" : asset?.mimeType === "image/webp" ? "webp" : "png";
      const a = el("a");
      a.href = await assetUrl(r.assetId);
      a.download = `mood-render-v${p.results.indexOf(r) + 1}.${ext}`;
      document.body.append(a);
      a.click();
      a.remove();
    })
  );
  main.append(resultActions);
  const job = p.jobs.find((j) => j.id === r.jobId);
  const pair = el("div", "comparison");
  for (const [assetId, label] of [
    [job.snapshot.sourceAssetId, "\uC0DD\uC131\uC5D0 \uC0AC\uC6A9\uD55C \uC6D0\uBCF8"],
    [r.assetId, "\uC120\uD0DD\uD55C \uC0DD\uC131 \uACB0\uACFC"]
  ])
    pair.append(
      append(
        el("figure"),
        append(el("div", "image-stage"), image(assetId, label)),
        el("figcaption", "", label)
      )
    );
  const used = el("section", "used-references");
  append(
    used,
    append(
      el("div", "pane-heading"),
      el("h3", "", "\uC774 \uACB0\uACFC\uC5D0 \uC0AC\uC6A9\uD55C \uB808\uD37C\uB7F0\uC2A4"),
      el("small", "", `${job.snapshot.board.items.length}\uAC1C \xB7 \uC0DD\uC131 \uB2F9\uC2DC \uC120\uD0DD`)
    )
  );
  if (job.snapshot.board.direction.trim())
    used.append(el("p", "used-direction", job.snapshot.board.direction));
  const usedGrid = el("div", "used-ref-grid");
  for (const item of job.snapshot.board.items) {
    const ref = job.snapshot.references.find((x) => x.id === item.referenceId);
    if (!ref) continue;
    const card = el("article", "used-ref-card");
    const preview = el("div", "used-ref-media");
    if (ref.assetId) preview.append(image(ref.assetId, ref.title));
    else preview.append(el("span", "", "\uC774\uBBF8\uC9C0 \uBBF8\uB4F1\uB85D"));
    const roleText = item.roles.map((x) => roleNames[x] || x).join(", ");
    const content = append(
      el("div", "used-ref-content"),
      el("h4", "", ref.title),
      el("span", "used-ref-role", roleText),
      el("p", "", ref.reason)
    );
    if (item.target.trim()) content.append(el("p", "", `\uC801\uC6A9 \uB300\uC0C1: ${item.target}`));
    if (item.note.trim()) content.append(el("p", "", `\uCC38\uACE0 \uC9C0\uC2DC: ${item.note}`));
    if (ref.sourceUrl)
      content.append(btn("\uC6D0\uBCF8 \uCD9C\uCC98 \uBCF4\uAE30", () => bridge.openLink(ref.sourceUrl), "ghost"));
    append(card, preview, content);
    usedGrid.append(card);
  }
  used.append(usedGrid);
  main.append(used);
  main.append(pair);
  const detail = el("div", "result-details");
  append(
    detail,
    append(
      el("div"),
      el("h3", "", "\uD615\uD0DC \uBE44\uAD50 \uBA54\uBAA8"),
      el(
        "p",
        "review-note",
        r.reviewNote || "\uC6D0\uBCF8\uACFC \uBE44\uAD50 \uD6C4 \uAD6C\uB3C4\xB7\uCC3D\uD638\xB7\uB9E4\uC2A4\uC758 \uBCC0\uD654 \uC5EC\uBD80\uB97C \uAE30\uB85D\uD558\uC138\uC694."
      )
    ),
    append(
      el("div"),
      el("h3", "", "\uC774 \uACB0\uACFC\uC5D0\uC11C \uC774\uC5B4\uAC00\uAE30"),
      field(
        "\uC218\uC815 \uC694\uCCAD",
        textArea(
          instruction,
          "\uC608: \uD615\uD0DC\uB294 \uC720\uC9C0\uD558\uACE0 \uBCBD \uB9C8\uAC10\uB9CC \uBC1D\uAC8C",
          (v) => instruction = v
        )
      ),
      btn(
        "\uC774 \uACB0\uACFC\uB97C \uC218\uC815 \uB300\uC0C1\uC73C\uB85C \uC120\uD0DD",
        () => {
          baseResultId = r.id;
          view = "board";
          mobile = "render";
          render();
        },
        "primary"
      )
    )
  );
  main.append(detail);
  return main;
}
function render() {
  $.replaceChildren(top());
  if (!p) {
    $.append(welcome());
    return;
  }
  const bar = el("nav", "viewbar");
  const saved = el(
    "span",
    "saved",
    dirty ? "\uC800\uC7A5\uD558\uC9C0 \uC54A\uC740 \uBCC0\uACBD" : "\uD504\uB85C\uC81D\uD2B8 \uC800\uC7A5\uB428"
  );
  saved.dataset.saved = "";
  append(
    bar,
    btn(
      "\uBB34\uB4DC\uBCF4\uB4DC",
      () => {
        view = "board";
        render();
      },
      view === "board" ? "active" : ""
    ),
    btn(
      `\uB808\uD37C\uB7F0\uC2A4 ${p.references.length}`,
      () => {
        view = "library";
        render();
      },
      view === "library" ? "active" : ""
    ),
    btn(
      `\uACB0\uACFC ${p.results.length}`,
      () => {
        view = "results";
        render();
      },
      view === "results" ? "active" : ""
    ),
    btn("\uC774\uB984 \uBCC0\uACBD", rename),
    saved
  );
  $.append(bar);
  if (view === "library") {
    $.append(append(el("main", "library-view"), gallery(true)));
    return;
  }
  if (view === "results") {
    $.append(results());
    return;
  }
  const tabs = el("nav", "mobile-tabs");
  [
    ["gallery", "\uB808\uD37C\uB7F0\uC2A4"],
    ["board", "\uBB34\uB4DC\uBCF4\uB4DC"],
    ["render", "\uC2E4\uC0AC\uD654"]
  ].forEach(
    ([key, title]) => tabs.append(
      btn(
        title,
        () => {
          mobile = key;
          render();
        },
        mobile === key ? "active" : ""
      )
    )
  );
  $.append(
    tabs,
    append(el("main", "workbench"), gallery(), board(), renderPane())
  );
}
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
setInterval(() => {
  if (!p || dirty || busy || document.hidden) return;
  const projectId = p.id;
  void call("get_project", { projectId }).then((next) => {
    if (!dirty && !busy && p?.id === projectId && next.revision !== p.revision) {
      p = next;
      render();
    }
  }).catch(() => {
  });
}, 5e3);
void (async () => {
  try {
    const c = await connectHost();
    bridge = c.bridge;
    mode = c.mode;
    await load();
  } catch (e) {
    $.replaceChildren(empty("\uC2A4\uD29C\uB514\uC624\uB97C \uC5F4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4", e.message));
  }
})();
