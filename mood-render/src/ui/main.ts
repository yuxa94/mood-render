import { connectHost } from "./bridge.js";
import type {
  Project,
  Board,
  Reference,
  Result,
  Job,
} from "../shared/contracts.js";
type Item = Board["items"][number];
const $ = document.getElementById("app")!;
let bridge: Awaited<ReturnType<typeof connectHost>>["bridge"];
let mode = "",
  projects: Project[] = [],
  p: Project | null = null,
  dirty = false,
  busy = false,
  view = "board",
  mobile = "board",
  baseResultId: string | undefined,
  resultId = "",
  query = "",
  instruction = "";
let librarySearch = "",
  libraryCategory = "all",
  libraryStatus = "all";
const urls = new Map<string, string>();
const loading = new Map<string, Promise<string>>();
let toastTimer: ReturnType<typeof setTimeout>;
const roleNames: Record<string, string> = {
  auto: "Auto",
  material: "재료",
  lighting: "조명",
  color: "색감",
  landscape: "조경",
  furniture: "가구",
  mood: "분위기",
};
const statusNames: Record<string, string> = {
  prepared: "준비",
  dispatched: "대화에 전달",
  running: "생성 중",
  "needs-result": "결과 등록 필요",
  completed: "완료",
  failed: "실패",
};
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = "",
  text?: string,
) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function append(
  e: HTMLElement,
  ...children: (Node | string | null | undefined)[]
) {
  for (const c of children) if (c !== undefined && c !== null) e.append(c);
  return e;
}
function btn(text: string, fn: () => unknown, cls = "") {
  const b = el("button", cls, text);
  b.type = "button";
  b.onclick = () => void run(fn);
  return b;
}
function toast(message: string, error = false) {
  const t = document.getElementById("toast")!;
  t.textContent = message;
  t.className = `visible${error ? " error" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ""), error ? 10000 : 4500);
}
async function run(fn: () => unknown) {
  if (busy) return;
  busy = true;
  document.body.classList.add("busy");
  try {
    await fn();
  } catch (e: any) {
    toast(e.message || "작업을 완료하지 못했습니다.", true);
  } finally {
    busy = false;
    document.body.classList.remove("busy");
  }
}
function changed() {
  dirty = true;
  document
    .querySelectorAll("[data-saved]")
    .forEach((e) => (e.textContent = "저장하지 않은 변경"));
}
function textArea(
  value: string,
  placeholder: string,
  change: (value: string) => void,
) {
  const t = el("textarea");
  t.value = value;
  t.placeholder = placeholder;
  t.oninput = () => change(t.value);
  return t;
}
function field(label: string, control: HTMLElement) {
  return append(el("label", "field"), el("span", "", label), control);
}
function empty(title: string, detail: string, cls = "") {
  return append(
    el("div", `empty ${cls}`),
    el("div", "empty-icon", "▧"),
    el("strong", "", title),
    el("span", "", detail),
  );
}
function input(
  value: string,
  placeholder: string,
  change: (value: string) => void,
) {
  const i = el("input");
  i.value = value;
  i.placeholder = placeholder;
  i.oninput = () => change(i.value);
  return i;
}
async function call(name: string, args: any = {}) {
  return bridge.callTool(name, args);
}
async function load(id?: string) {
  projects = await call("list_projects");
  if (id) p = await call("get_project", { projectId: id });
  else p = null;
  dirty = false;
  render();
}
async function refresh() {
  if (dirty) {
    if (
      !(await confirmDialog(
        "저장하지 않은 변경이 있습니다.",
        "현재 편집을 버리고 저장된 상태를 불러올까요?",
      ))
    )
      return;
  }
  await load(p?.id);
  toast("최신 상태를 불러왔습니다.");
}
function confirmDialog(title: string, message: string) {
  return new Promise<boolean>((resolve) => {
    const d = el("dialog");
    append(d, el("h2", "", title), el("p", "", message));
    const actions = el("div", "dialog-actions");
    const cancel = el("button", "", "취소"),
      ok = el("button", "primary", "계속");
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
  if (
    dirty &&
    !(await confirmDialog(
      "저장하지 않은 변경이 있습니다.",
      "현재 편집을 버리고 새 프로젝트를 만들까요?",
    ))
  )
    return;
  await new Promise<void>((resolve) => {
    const d = el("dialog");
    let name = "";
    const i = input("", "예: 성수동 주거 외관", (v) => (name = v));
    const cancel = el("button", "", "취소"),
      ok = el("button", "primary", "프로젝트 만들기");
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
      } catch (e: any) {
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
      el("h2", "", "새 프로젝트"),
      el(
        "p",
        "",
        "모델링 이미지, 무드보드, 생성 결과를 하나의 프로젝트에 보관합니다.",
      ),
      field("프로젝트 이름", i),
      append(el("div", "dialog-actions"), cancel, ok),
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
  const i = input(name, "프로젝트 이름", (v) => (name = v));
  const ok = el("button", "primary", "이름 저장");
  ok.onclick = async () => {
    try {
      if (!p) return;
      p = await call("rename_project", {
        projectId: p.id,
        name,
        expectedRevision: p.revision,
      });
      d.close();
      d.remove();
      projects = await call("list_projects");
      render();
    } catch (e: any) {
      toast(e.message, true);
    }
  };
  const close = el("button", "", "취소");
  close.onclick = () => {
    d.close();
    d.remove();
  };
  append(
    d,
    el("h2", "", "프로젝트 이름"),
    i,
    append(el("div", "dialog-actions"), close, ok),
  );
  document.body.append(d);
  d.showModal();
}
async function save() {
  if (!p) return;
  p = await call("save_board", {
    projectId: p.id,
    board: p.board,
    expectedRevision: p.revision,
  });
  dirty = false;
  await bridge.updateContext(
    `Mood Render projectId=${p!.id}, revision=${p!.revision}. 사용자가 선택한 참조: ${p!.board.items.map((i) => i.referenceId).join(", ")}. 전체 프로젝트는 get_project로 읽으세요.`,
  );
  render();
}
function pickFile(fn: (files: File[]) => Promise<void>, multiple = false) {
  const i = el("input", "file-input");
  i.type = "file";
  i.accept = "image/png,image/jpeg,image/webp";
  i.multiple = multiple;
  i.onchange = () => {
    const files = [...(i.files || [])];
    i.remove();
    if (files.length) void run(() => fn(files));
  };
  document.body.append(i);
  i.click();
}
async function upload(f: File) {
  if (!p) throw Error("프로젝트를 먼저 만드세요.");
  if (f.size > 25 * 1024 * 1024 || !f.size)
    throw Error("25MB 이하 이미지를 선택하세요.");
  const bitmap = await createImageBitmap(f).catch(() => {
    throw Error("이미지 파일을 읽을 수 없습니다.");
  });
  bitmap.close();
  const bytes = new Uint8Array(await f.arrayBuffer()),
    uploadId = crypto.randomUUID(),
    totalChunks = Math.ceil(bytes.length / 262144);
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
      dataBase64: btoa(binary),
    });
  }
  const out = await call("finish_image_upload", {
    projectId: p.id,
    uploadId,
    expectedRevision: p.revision,
  });
  p.revision = out.revision;
  p.assets.push(out.asset);
  return out.asset;
}
async function assetUrl(assetId: string, projectId = p!.id): Promise<string> {
  const key = projectId + assetId;
  if (urls.has(key)) return urls.get(key)!;
  if (loading.has(key)) return loading.get(key)!;
  const promise = (async () => {
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let total = 1,
      mime = "";
    for (let index = 0; index < total; index++) {
      const r = await call("read_image_chunk", { projectId, assetId, index });
      total = r.totalChunks;
      mime = r.mimeType;
      chunks.push(
        Uint8Array.from(atob(r.dataBase64), (c: string) => c.charCodeAt(0)),
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
function image(assetId: string, alt: string, cls = "") {
  const i = el("img", cls);
  i.alt = alt;
  void assetUrl(assetId)
    .then((url) => (i.src = url))
    .catch((e) => {
      i.alt = "이미지를 불러올 수 없습니다";
      i.title = e.message;
    });
  return i;
}
async function addImages(files: File[], referenceId?: string) {
  if (dirty) await save();
  for (const f of files) {
    const a = await upload(f);
    if (referenceId) {
      p = await call("attach_reference_image", {
        projectId: p!.id,
        referenceId,
        assetId: a.id,
        expectedRevision: p!.revision,
      });
    } else {
      p = await call("add_references", {
        projectId: p!.id,
        expectedRevision: p!.revision,
        items: [
          {
            title: f.name,
            sourceUrl: "",
            reason: "직접 등록한 레퍼런스",
            category: "mood",
            assetId: a.id,
          },
        ],
      });
    }
  }
  render();
  toast("레퍼런스 이미지를 등록했습니다.");
}
async function setSource(files: File[]) {
  if (dirty) await save();
  const a = await upload(files[0]);
  p = await call("set_source", {
    projectId: p!.id,
    assetId: a.id,
    expectedRevision: p!.revision,
  });
  render();
  toast("원본 이미지를 등록했습니다.");
}
function toggle(r: Reference) {
  if (!p) return;
  const index = p.board.items.findIndex((i) => i.referenceId === r.id);
  if (index >= 0) p.board.items.splice(index, 1);
  else
    p.board.items.push({
      referenceId: r.id,
      roles: ["auto"],
      target: "",
      note: "",
    });
  changed();
  render();
}
function move(id: string, to: number) {
  if (!p) return;
  const i = p.board.items.findIndex((i) => i.referenceId === id);
  if (i < 0) return;
  const [item] = p.board.items.splice(i, 1);
  p.board.items.splice(
    Math.max(0, Math.min(to, p.board.items.length)),
    0,
    item,
  );
  changed();
  render();
}
async function sendOrCopy(text: string, title: string) {
  const state = await bridge.sendMessage(text);
  if (state === "sent") {
    toast("Codex 대화에 요청을 전달했습니다.");
    return true;
  }
  const d = el("dialog");
  const t = textArea(text, "", () => {});
  t.readOnly = true;
  const copy = el("button", "primary", "실행문 복사");
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      copy.textContent = "복사됨";
    } catch {
      t.select();
      document.execCommand("copy");
      copy.textContent = "복사됨";
    }
  };
  const close = el("button", "", "닫기");
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
      state === "failed"
        ? "대화 전달에 실패했습니다. 아래 실행문을 Codex 대화에 붙여넣으세요."
        : "아래 실행문을 이 프로젝트의 Codex 대화에 붙여넣으세요. 저장된 이미지와 설정을 이어서 사용합니다.",
    ),
    t,
    append(el("div", "dialog-actions"), close, copy),
  );
  document.body.append(d);
  d.showModal();
  return false;
}
function requestText(job: Job) {
  return `Mood Render 플러그인의 render-from-moodboard 스킬로 실사화해줘. projectId=${p!.id}, jobId=${job.id}. get_render로 저장된 입력과 지시서를 읽고 모든 실제 이미지를 확인한 다음 Codex 내장 이미지 도구만 사용해줘. 결과를 프로젝트에 새 버전으로 등록하고 원본과 비교해줘. 플러그인 도구가 현재 대화에 없으면 설치된 mood-render 스킬의 로컬 CLI 경로로 작업을 이어가줘. API는 사용하지 마.`;
}
async function research() {
  if (!p) return;
  if (dirty) await save();
  const text = `Mood Render reference-research 스킬로 projectId=${p!.id}의 원본을 확인하고 레퍼런스 약 12개를 찾아 UI에 등록해줘. 원하는 방향: ${query || p!.board.direction || "원본 공간과 어울리는 재료와 조명"}. 출처와 참고 이유를 기록하고 실제 확인한 이미지로 미리보기를 만들어줘. 정책상 이미지 확보가 불가능하면 링크와 상태를 기록해줘. 선택은 내가 할게. 도구가 없으면 설치된 스킬의 로컬 CLI를 사용해줘.`;
  await sendOrCopy(text, "레퍼런스 검색 요청");
}
async function prepare() {
  if (!p) return;
  if (dirty) await save();
  const r = await call("prepare_render", {
    projectId: p!.id,
    expectedRevision: p!.revision,
    clientRequestId: crypto.randomUUID(),
    ...(baseResultId ? { baseResultId } : {}),
    instruction,
  });
  p = await call("get_project", { projectId: p!.id });
  render();
  if (await sendOrCopy(requestText(r.job), "실사화 요청")) {
    await call("set_render_status", {
      projectId: p!.id,
      jobId: r.job.id,
      status: "dispatched",
    });
    p = await call("get_project", { projectId: p!.id });
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
      mode === "codex" ? "Codex 연결" : "로컬 스튜디오 · 요청문 복사",
    ),
  );
  const select = el("select", "project-picker");
  select.setAttribute("aria-label", "프로젝트 선택");
  append(select, new Option("프로젝트 선택", ""));
  for (const a of projects) select.add(new Option(a.name, a.id));
  select.value = p?.id || "";
  select.onchange = () =>
    void run(async () => {
      if (
        dirty &&
        !(await confirmDialog(
          "저장하지 않은 변경",
          "현재 편집을 버리고 프로젝트를 변경할까요?",
        ))
      ) {
        select.value = p?.id || "";
        return;
      }
      baseResultId = undefined;
      await load(select.value || undefined);
    });
  append(
    header,
    select,
    btn("새 프로젝트", newProject),
    btn("새로고침", refresh, "ghost"),
  );
  return header;
}
function welcome() {
  const w = el("main", "welcome");
  const a = el("div");
  append(
    a,
    el("h2", "", "모델의 형태에,\n원하는 분위기를."),
    el(
      "p",
      "",
      "3D 이미지에서 시작해 레퍼런스를 고르고, 재료와 빛을 정리하세요. 완성된 무드보드를 Codex에 전달해 실사 이미지를 만듭니다.",
    ),
    btn("첫 프로젝트 만들기", newProject, "primary"),
  );
  const flow = el("div", "flow");
  [
    ["1", "원본 이미지", "모델링 화면 또는 렌더 이미지를 등록합니다."],
    ["2", "레퍼런스와 무드보드", "이미지를 고르고 참고할 요소를 지정합니다."],
    ["3", "실사화와 비교", "원본의 형태를 기준으로 새 결과를 만듭니다."],
  ].forEach(([n, t, d]) =>
    flow.append(
      append(
        el("article"),
        el("span", "step", n),
        append(el("div"), el("h3", "", t), el("p", "", d)),
      ),
    ),
  );
  append(
    w,
    a,
    flow,
    el(
      "p",
      "welcome-foot",
      "PNG · JPEG · WebP / 파일당 25MB 이하 / 프로젝트는 이 컴퓨터에 저장됩니다.",
    ),
  );
  return w;
}
const categoryNames: Record<string, string> = {
  material: "재료",
  lighting: "조명",
  color: "색감",
  landscape: "조경",
  furniture: "가구",
  mood: "분위기",
};
function gallery(expanded = false) {
  const pane = el(
    "section",
    `pane gallery-pane ${expanded ? "expanded" : ""} ${mobile === "gallery" ? "mobile-visible" : ""}`,
  );
  append(
    pane,
    append(
      el("div", "pane-heading"),
      el("h2", "", "레퍼런스"),
      el("small", "", `${p!.references.length}개 · ${p!.board.items.length}개 선택`),
      btn("+ 이미지", () => pickFile((f) => addImages(f), true), "ghost"),
    ),
    el(
      "p",
      "pane-intro",
      expanded
        ? "사진을 비교해 원하는 후보를 고르세요. 선택 내용은 무드보드에 담깁니다."
        : "원하는 이미지를 골라 무드보드에 담으세요.",
    ),
  );
  if (!expanded)
    pane.append(
      btn("라이브러리 크게 보기", () => {
        view = "library";
        render();
      }, "library-open"),
    );
  else
    pane.append(
      btn("무드보드로 돌아가기", () => {
        view = "board";
        render();
      }, "ghost library-back"),
    );
  const search = el("div", "search-box");
  append(
    search,
    textArea(
      query,
      "예: 밝은 석재, 깊은 창호, 흐린 날의 부드러운 빛",
      (v) => (query = v),
    ),
    btn("Codex에 레퍼런스 검색 요청", research),
  );
  if (expanded)
    pane.append(
      append(
        el("details", "research-disclosure"),
        el("summary", "", "새 레퍼런스 찾기"),
        search,
      ),
    );
  else pane.append(search);
  const filters = el("div", "library-filters");
  const find = input(librarySearch, "제목·참고 이유 검색", (value) => {
    librarySearch = value;
    updateGalleryFilter();
  });
  find.type = "search";
  find.setAttribute("aria-label", "레퍼런스 검색");
  const category = el("select");
  category.setAttribute("aria-label", "분야 필터");
  category.add(new Option("모든 분야", "all"));
  for (const [key, label] of Object.entries(categoryNames))
    category.add(new Option(label, key));
  category.value = libraryCategory;
  category.onchange = () => {
    libraryCategory = category.value;
    updateGalleryFilter();
  };
  const status = el("select");
  status.setAttribute("aria-label", "상태 필터");
  for (const [label, key] of [
    ["전체 후보", "all"],
    ["선택한 이미지", "selected"],
    ["미리보기 있음", "ready"],
    ["이미지 연결 필요", "link-only"],
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
  if (!p!.references.length)
    grid.append(
      empty(
        "아직 레퍼런스가 없습니다",
        "검색을 요청하거나 가지고 있는 이미지를 등록하세요.",
        "wide",
      ),
    );
  for (const r of p!.references) {
    const selected = p!.board.items.some((i) => i.referenceId === r.id);
    const card = el("article", `reference ${selected ? "selected" : ""}`);
    card.dataset.search = `${r.title} ${r.reason}`.toLocaleLowerCase();
    card.dataset.category = r.category;
    card.dataset.selected = String(selected);
    card.dataset.ready = String(!!r.assetId);
    const media = el("div", "ref-media");
    if (r.assetId) media.append(image(r.assetId, r.title));
    else media.append(el("small", "", "이미지 등록 필요"));
    const select = btn(selected ? "✓" : "+", () => toggle(r), "select-ref");
    if (!r.assetId && !selected) {
      select.disabled = true;
      select.title = "이미지를 연결한 뒤 선택할 수 있습니다.";
    }
    select.setAttribute(
      "aria-label",
      `${r.title} ${selected ? "선택 해제" : "선택"}`,
    );
    select.setAttribute("aria-pressed", String(selected));
    append(card, media, select, el("h3", "", r.title), el("p", "ref-reason", r.reason));
    const acts = el("div", "ref-actions");
    if (r.sourceUrl)
      acts.append(btn("출처", () => bridge.openLink(r.sourceUrl)));
    if (!r.assetId)
      acts.append(
        btn("이미지 연결", () => pickFile((f) => addImages(f, r.id))),
      );
    card.append(acts);
    grid.append(card);
  }
  pane.append(grid);
  const noMatches = el("p", "filter-empty", "조건에 맞는 레퍼런스가 없습니다. 검색어나 필터를 바꿔보세요.");
  pane.append(noMatches);
  queueMicrotask(() => updateGalleryFilter());
  return pane;
}
function updateGalleryFilter() {
  const term = librarySearch.trim().toLocaleLowerCase();
  for (const pane of document.querySelectorAll<HTMLElement>(".gallery-pane")) {
    const cards = [...pane.querySelectorAll<HTMLElement>(".reference")];
    let visible = 0;
    for (const card of cards) {
      const matches = (!term || (card.dataset.search || "").includes(term)) &&
        (libraryCategory === "all" || card.dataset.category === libraryCategory) &&
        (libraryStatus === "all" ||
          (libraryStatus === "selected" && card.dataset.selected === "true") ||
          (libraryStatus === "ready" && card.dataset.ready === "true") ||
          (libraryStatus === "link-only" && card.dataset.ready === "false"));
      card.hidden = !matches;
      if (matches) visible++;
    }
    const count = pane.querySelector(".filter-count");
    if (count) count.textContent = `${visible} / ${cards.length}개 표시`;
    const empty = pane.querySelector<HTMLElement>(".filter-empty");
    if (empty) empty.hidden = visible !== 0 || cards.length === 0;
  }
}
function board() {
  const pane = el(
    "section",
    `pane board-pane ${mobile === "board" ? "mobile-visible" : ""}`,
  );
  append(
    pane,
    append(
      el("div", "pane-heading"),
      el("h2", "", "무드보드"),
      el("small", "", `${p!.board.items.length}개 선택`),
    ),
    el(
      "p",
      "pane-intro",
      "이미지만 고르면 Auto가 참고할 요소를 판단합니다. 필요할 때 직접 지정하세요.",
    ),
  );
  if (!p!.board.items.length)
    pane.append(
      empty(
        "선택한 이미지가 이곳에 모입니다",
        "재료, 빛, 색감이 서로 어울리는 이미지부터 골라보세요.",
        "board-empty",
      ),
    );
  p!.board.items.forEach((item, index) => {
    const r = p!.references.find((r) => r.id === item.referenceId)!;
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
      btn("↑", () => move(item.referenceId, index - 1)),
      btn("↓", () => move(item.referenceId, index + 1)),
      btn("×", () => toggle(r)),
    );
    const body = el("div", "board-card-body");
    if (r.assetId) body.append(image(r.assetId, r.title, "board-image"));
    else body.append(empty("이미지 필요", "후보에서 이미지를 연결하세요."));
    const settings = el("div");
    const roles = el("div", "roles");
    for (const [key, label] of Object.entries(roleNames)) {
      const b = btn(
        label,
        () => {
          const rs = item.roles as string[];
          if (key === "auto") item.roles = ["auto"];
          else {
            const explicit = item.roles.filter((v) => v !== "auto");
            item.roles = rs.includes(key)
              ? explicit.filter((v) => v !== key)
              : [...explicit, key as Item["roles"][number]];
            if (!item.roles.length) item.roles = ["auto"];
          }
          changed();
          render();
        },
        `role ${item.roles.includes(key as any) ? "on" : ""}`,
      );
      b.setAttribute("aria-pressed", String(item.roles.includes(key as any)));
      roles.append(b);
    }
    append(
      settings,
      roles,
      el("p", "muted", "Auto는 참고할 요소와 적용 대상을 이미지에서 자동으로 판단합니다."),
      input(item.target, "적용 대상 (선택 사항 · 비우면 자동)", (v) => {
        item.target = v;
        changed();
      }),
      textArea(item.note, "참고할 부분 (선택 사항 · 비우면 자동)", (v) => {
        item.note = v;
        changed();
      }),
    );
    append(body, settings);
    append(card, title, body);
    pane.append(card);
  });
  append(
    pane,
    field(
      "전체 분위기",
      textArea(
        p!.board.direction,
        "재료와 빛, 색감의 공통 방향을 적어주세요.",
        (v) => {
          p!.board.direction = v;
          changed();
        },
      ),
    ),
    append(
      el("div", "board-footer"),
      el(
        "small",
        "",
        dirty
          ? "저장하지 않은 변경"
          : "변경사항을 저장하면 다음 작업에도 이어집니다.",
      ),
      btn(
        "무드보드 저장",
        async () => {
          await save();
          toast("무드보드를 저장했습니다.");
        },
        "primary",
      ),
    ),
  );
  return pane;
}
function renderPane() {
  const pane = el(
    "section",
    `pane ${mobile === "render" ? "mobile-visible" : ""}`,
  );
  append(
    pane,
    el("h2", "", "실사화"),
    el("p", "pane-intro", "원본의 구도와 형태에 선택한 무드를 적용합니다."),
  );
  const src = el("div", "source-box");
  if (p!.sourceAssetId) src.append(image(p!.sourceAssetId, "원본 3D 이미지"));
  else
    src.append(
      empty("원본 3D 이미지", "모델링 화면 또는 렌더 이미지를 등록하세요."),
    );
  append(
    pane,
    src,
    btn(
      p!.sourceAssetId ? "원본 이미지 변경" : "원본 이미지 등록",
      () => pickFile(setSource),
      "source-upload",
    ),
    el("label", "field", "원본에서 유지할 요소"),
  );
  const checks = el("div", "checks");
  for (const [key, label] of Object.entries({
    camera: "카메라·구도",
    structure: "매스·벽체",
    openings: "창호·개구부",
    furniture: "가구 배치",
  })) {
    const i = el("input");
    i.type = "checkbox";
    i.checked = p!.board.preserve[key as keyof Board["preserve"]];
    i.onchange = () => {
      p!.board.preserve[key as keyof Board["preserve"]] = i.checked;
      changed();
    };
    checks.append(append(el("label"), i, label));
  }
  pane.append(checks);
  if (baseResultId)
    append(
      pane,
      el("small", "", "선택한 결과를 수정하는 중"),
      btn(
        "원본부터 생성",
        () => {
          baseResultId = undefined;
          render();
        },
        "ghost",
      ),
    );
  append(
    pane,
    field(
      "추가 요청",
      textArea(
        instruction,
        "예: 조경은 절제하고 석재 질감을 강조해줘",
        (v) => (instruction = v),
      ),
    ),
    append(
      el("div", "render-action"),
      btn(
        baseResultId ? "선택 결과 수정 요청" : "이 무드로 실사화",
        prepare,
        "primary",
      ),
      el(
        "p",
        "muted",
        mode === "codex"
          ? "선택한 이미지와 지시서를 Codex 대화에 전달합니다."
          : "요청문을 복사해 Codex 대화에 붙여넣으면 이어서 생성합니다.",
      ),
    ),
  );
  const jobs = el("div", "jobs");
  if (p!.jobs.length) jobs.append(el("h3", "", "최근 작업"));
  for (const j of [...p!.jobs].reverse().slice(0, 5)) {
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
            minute: "2-digit",
          }),
        ),
      ),
    );
    if (j.error) line.append(el("p", "error", j.error));
    const actions = el("div", "row");
    if (["prepared", "dispatched"].includes(j.status))
      actions.append(
        btn("요청문 보기", () =>
          sendOrCopy(requestText(j), "저장된 실사화 요청"),
        ),
      );
    if (["running", "needs-result"].includes(j.status))
      actions.append(
        btn("결과 이미지 등록", () => pickFile((f) => registerFile(j, f[0]))),
      );
    if (["dispatched", "running"].includes(j.status))
      actions.append(
        btn("상태 확인 요청", () =>
          sendOrCopy(
            `Mood Render projectId=${p!.id}, jobId=${j.id} 작업 상태를 확인해줘. get_render를 읽고, 이미 실행한 작업은 중복 생성하지 말고 결과를 등록하거나 실패 원인을 기록해줘.`,
            "작업 상태 확인",
          ),
        ),
      );
    if (j.status === "completed")
      actions.append(
        btn("결과 보기", () => {
          resultId = p!.results.find((r) => r.jobId === j.id)?.id || "";
          view = "results";
          render();
        }),
      );
    line.append(actions);
    jobs.append(line);
  }
  pane.append(jobs);
  return pane;
}
async function registerFile(job: Job, file: File) {
  if (dirty) await save();
  const a = await upload(file);
  const r = await call("register_result", {
    projectId: p!.id,
    jobId: job.id,
    assetId: a.id,
    note: "사용자가 저장한 결과 이미지",
    reviewNote: "형태 비교 전",
  });
  p = r.project;
  resultId = r.result.id;
  view = "results";
  render();
  toast("결과 이미지를 등록했습니다.");
}
function results() {
  const main = el("main", "results-view");
  append(
    main,
    append(
      el("div", "pane-heading"),
      el("h2", "", "원본과 결과 비교"),
      el("small", "", `${p!.results.length}개 결과`),
    ),
  );
  if (!p!.results.length) {
    main.append(
      empty(
        "아직 생성 결과가 없습니다",
        "무드보드를 저장하고 실사화를 요청하세요.",
      ),
    );
    return main;
  }
  const select = el("select");
  for (const [i, r] of p!.results.entries())
    select.add(
      new Option(
        `버전 ${i + 1} — ${new Date(r.createdAt).toLocaleString("ko-KR")}`,
        r.id,
      ),
    );
  const r = p!.results.find((r) => r.id === resultId) || p!.results.at(-1)!;
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
    btn("결과 이미지 저장", async () => {
      const asset = p!.assets.find((a) => a.id === r.assetId);
      const ext = asset?.mimeType === "image/jpeg" ? "jpg" : asset?.mimeType === "image/webp" ? "webp" : "png";
      const a = el("a");
      a.href = await assetUrl(r.assetId);
      a.download = `mood-render-v${p!.results.indexOf(r) + 1}.${ext}`;
      document.body.append(a);
      a.click();
      a.remove();
    }),
  );
  main.append(resultActions);
  const job = p!.jobs.find((j) => j.id === r.jobId)!;
  const pair = el("div", "comparison");
  for (const [assetId, label] of [
    [job.snapshot.sourceAssetId, "생성에 사용한 원본"],
    [r.assetId, "선택한 생성 결과"],
  ])
    pair.append(
      append(
        el("figure"),
        append(el("div", "image-stage"), image(assetId, label)),
        el("figcaption", "", label),
      ),
    );
  const used = el("section", "used-references");
  append(
    used,
    append(
      el("div", "pane-heading"),
      el("h3", "", "이 결과에 사용한 레퍼런스"),
      el("small", "", `${job.snapshot.board.items.length}개 · 생성 당시 선택`),
    ),
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
    else preview.append(el("span", "", "이미지 미등록"));
    const roleText = item.roles.map((x) => roleNames[x] || x).join(", ");
    const content = append(
      el("div", "used-ref-content"),
      el("h4", "", ref.title),
      el("span", "used-ref-role", roleText),
      el("p", "", ref.reason),
    );
    if (item.target.trim()) content.append(el("p", "", `적용 대상: ${item.target}`));
    if (item.note.trim()) content.append(el("p", "", `참고 지시: ${item.note}`));
    if (ref.sourceUrl)
      content.append(btn("원본 출처 보기", () => bridge.openLink(ref.sourceUrl), "ghost"));
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
      el("h3", "", "형태 비교 메모"),
      el(
        "p",
        "review-note",
        r.reviewNote ||
          "원본과 비교 후 구도·창호·매스의 변화 여부를 기록하세요.",
      ),
    ),
    append(
      el("div"),
      el("h3", "", "이 결과에서 이어가기"),
      field(
        "수정 요청",
        textArea(
          instruction,
          "예: 형태는 유지하고 벽 마감만 밝게",
          (v) => (instruction = v),
        ),
      ),
      btn(
        "이 결과를 수정 대상으로 선택",
        () => {
          baseResultId = r.id;
          view = "board";
          mobile = "render";
          render();
        },
        "primary",
      ),
    ),
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
    dirty ? "저장하지 않은 변경" : "프로젝트 저장됨",
  );
  saved.dataset.saved = "";
  append(
    bar,
    btn(
      "무드보드",
      () => {
        view = "board";
        render();
      },
      view === "board" ? "active" : "",
    ),
    btn(
      `레퍼런스 ${p.references.length}`,
      () => {
        view = "library";
        render();
      },
      view === "library" ? "active" : "",
    ),
    btn(
      `결과 ${p.results.length}`,
      () => {
        view = "results";
        render();
      },
      view === "results" ? "active" : "",
    ),
    btn("이름 변경", rename),
    saved,
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
    ["gallery", "레퍼런스"],
    ["board", "무드보드"],
    ["render", "실사화"],
  ].forEach(([key, title]) =>
    tabs.append(
      btn(
        title,
        () => {
          mobile = key;
          render();
        },
        mobile === key ? "active" : "",
      ),
    ),
  );
  $.append(
    tabs,
    append(el("main", "workbench"), gallery(), board(), renderPane()),
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
  void call("get_project", { projectId })
    .then((next) => {
      if (
        !dirty &&
        !busy &&
        p?.id === projectId &&
        next.revision !== p.revision
      ) {
        p = next;
        render();
      }
    })
    .catch(() => {});
}, 5000);
void (async () => {
  try {
    const c = await connectHost();
    bridge = c.bridge;
    mode = c.mode;
    await load();
  } catch (e: any) {
    $.replaceChildren(empty("스튜디오를 열지 못했습니다", e.message));
  }
})();
