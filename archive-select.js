import { getArchiveRepository } from "./data/archive-repository.mjs";
import { getWorkRepository } from "./data/work-repository.mjs";
import { downloadBlob } from "./data/browser-download.mjs";
import { createPortfolioSourceCache, generateWithinBudget, PortfolioExportError } from "./data/portfolio-export.mjs";
import { chainedSelectFilename, createChainedSelectPlan, renderChainedSelectPdf } from "./data/chained-select-export.mjs";
import { CHAINED_SELECT_MAX_IMAGES, CHAINED_SELECT_MAX_WORKS, chainedSelectLimit, createChainedSelectState, readChainedSelectSession } from "./data/chained-select-state.mjs";
import { revalidateChainedSelectWorks } from "./data/chained-select-review.mjs";

const workRoot = document.querySelector("#select-works");
const titleInput = document.querySelector("#select-title");
const selectorInput = document.querySelector("#select-selector");
const summary = document.querySelector("#select-summary");
const count = document.querySelector("#select-count");
const generateButton = document.querySelector("#select-generate");
const errorElement = document.querySelector("#select-error");
const statusElement = document.querySelector("#select-status");
const fontUrl = "assets/fonts/CascadiaCode-Regular.ttf";
let works = [];
let profiles = [];
let selection = createChainedSelectState();
let fontBytesPromise = null;
let archiveRepository = null;

function text(value) { return typeof value === "string" ? value.trim() : ""; }
function setError(message = "") { errorElement.textContent = message; errorElement.hidden = !message; }
function setStatus(message = "") { statusElement.textContent = message; }
function selectedWorks() { const byId = new Map(works.map((work) => [work.id, work])); return selection.ids().map((id) => byId.get(id)).filter(Boolean); }
function selectorName() { return profiles.find((profile) => profile.id === selectorInput.value)?.name || ""; }
function imageCount(work) { return work.images?.length || 0; }
function action(label, handler, disabled = false) { const button = document.createElement("button"); button.type = "button"; button.className = "text-action"; button.textContent = label; button.disabled = disabled; button.addEventListener("click", handler); return button; }

function render() {
  workRoot.replaceChildren();
  const selected = selectedWorks();
  const limit = chainedSelectLimit(selected);
  count.textContent = `${limit.workCount} SELECTED · ${limit.imageCount} IMAGES`;
  works.forEach((work) => {
    const row = document.createElement("article"); row.className = "chained-select-work";
    const input = document.createElement("input"); input.type = "checkbox"; input.id = `select-work-${work.id}`; input.checked = selection.has(work.id); input.setAttribute("aria-label", `Include ${work.title}`);
    input.addEventListener("change", () => { input.checked ? selection.select(work.id) : selection.deselect(work.id); render(); });
    const label = document.createElement("label"); label.htmlFor = input.id;
    const title = document.createElement("strong"); title.textContent = work.title || "UNTITLED";
    const meta = document.createElement("small"); meta.textContent = [work.artistName, work.yearLabel, `${imageCount(work)} IMAGE${imageCount(work) === 1 ? "" : "S"}`].filter(Boolean).join(" · ");
    label.append(title, meta);
    const controls = document.createElement("div"); controls.className = "chained-select-work-actions";
    const index = selected.findIndex((item) => item.id === work.id);
    if (index >= 0) controls.append(action("[ MOVE UP ]", () => { selection.move(work.id, -1); render(); }, index === 0), action("[ MOVE DOWN ]", () => { selection.move(work.id, 1); render(); }, index === selected.length - 1), action("[ REMOVE ]", () => { selection.deselect(work.id); render(); }));
    row.append(input, label, controls); workRoot.append(row);
  });
  generateButton.disabled = !limit.valid || !selectorName();
  if (limit.workCount > CHAINED_SELECT_MAX_WORKS || limit.imageCount > CHAINED_SELECT_MAX_IMAGES) setError(`REDUCE THIS SELECT TO ${CHAINED_SELECT_MAX_WORKS} WORKS OR ${CHAINED_SELECT_MAX_IMAGES} IMAGES`);
  else if (!selected.length) setError("SELECT AT LEAST ONE PUBLIC WORK");
  else if (!selectorName()) setError("SELECTOR PROFILE IS REQUIRED");
  else setError();
}

async function fontBytes() {
  if (!fontBytesPromise) fontBytesPromise = fetch(fontUrl).then((response) => response.ok ? response.arrayBuffer() : Promise.reject(new Error("font unavailable")));
  return fontBytesPromise;
}

async function imageFromBlob(blob) {
  const url = URL.createObjectURL(blob);
  try { const image = new Image(); await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; }); if (!image.naturalWidth || !image.naturalHeight) throw new Error("image unavailable"); return image; }
  finally { URL.revokeObjectURL(url); }
}

async function prepareImage(image, tier, cache) {
  let canvas;
  try {
    const decoded = await imageFromBlob(await cache.get(image));
    const scale = Math.min(1, tier.maxDimension / Math.max(decoded.naturalWidth, decoded.naturalHeight));
    canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(decoded.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(decoded.naturalHeight * scale));
    const context = canvas.getContext("2d", { alpha: false }); if (!context) throw new Error("canvas unavailable");
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(decoded, 0, 0, canvas.width, canvas.height); decoded.src = "";
    const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("encode failed")), "image/jpeg", tier.jpegQuality));
    return Object.freeze({ mimeType: "image/jpeg", bytes: new Uint8Array(await blob.arrayBuffer()) });
  } catch { throw new PortfolioExportError("ONE OR MORE PUBLIC IMAGES COULD NOT BE PREPARED FOR SELECT"); }
  finally { if (canvas) { canvas.width = 1; canvas.height = 1; } }
}

async function generate() {
  const selected = selectedWorks(); const limit = chainedSelectLimit(selected); setError();
  if (!limit.valid || !selectorName()) return render();
  if (!window.PDFLib || !window.fontkit) return setError("PDF GENERATION IS CURRENTLY UNAVAILABLE");
  generateButton.disabled = true; generateButton.textContent = "[ GENERATING… ]";
  let cache;
  try {
    const revalidated = await revalidateChainedSelectWorks({ repository: archiveRepository, reviewWorks: works, selectedIds: selection.ids() });
    works = [...revalidated.works];
    selection = createChainedSelectState(works.map((work) => work.id), revalidated.selectedIds);
    if (revalidated.unavailableIds.length) {
      setStatus(`SELECTION UPDATED · ${revalidated.unavailableIds.length} WORK${revalidated.unavailableIds.length === 1 ? "" : "S"} NO LONGER PUBLICLY AVAILABLE · REVIEW BEFORE GENERATING`);
      render();
      return;
    }

    const currentSelection = selectedWorks();
    const currentLimit = chainedSelectLimit(currentSelection);
    if (!currentLimit.valid) return render();
    const plan = createChainedSelectPlan(currentSelection);
    cache = createPortfolioSourceCache(async ([image]) => {
      const response = await fetch(image.src, { cache: "no-store" });
      if (!response.ok) throw new Error("public image unavailable");
      const blob = await response.blob();
      if (!blob.size) throw new Error("empty public image");
      return [{ imageId: image.id, blob }];
    });
    await cache.prepare(); await cache.preload(plan.imagePages.map((entry) => entry.image));
    const output = await generateWithinBudget({ failureSubject: "SELECT", renderTier: async (tier) => renderChainedSelectPdf({ PDFLib: window.PDFLib, fontkit: window.fontkit, fontBytes: await fontBytes(), plan, title: titleInput.value, selectorName: selectorName(), tier, loadPreparedImage: (image, currentTier) => prepareImage(image, currentTier, cache) }) });
    downloadBlob(output.bytes, { filename: chainedSelectFilename(titleInput.value) });
    setStatus(`CHAINED SELECT READY · ${(output.size / (1024 * 1024)).toFixed(1)} MB · ${output.tier.id.toUpperCase()}`);
  } catch (error) { setError(error instanceof PortfolioExportError ? error.message : "PDF GENERATION FAILED"); }
  finally { try { await cache?.clear(); } catch {} generateButton.textContent = "[ GENERATE CHAINED SELECT ]"; render(); }
}

async function initialise() {
  const session = readChainedSelectSession(window.sessionStorage);
  if (!session) { setError("CHAINED SELECT SOURCE IS NO LONGER AVAILABLE"); return; }
  titleInput.value = session.title;
  const [{ repository: archive }, { repository: workRepository }] = await Promise.all([getArchiveRepository(), getWorkRepository()]);
  if (!archive || !workRepository) throw new Error("repository unavailable");
  archiveRepository = archive;
  [works, profiles] = await Promise.all([archiveRepository.listArchivedSelectWorks(session.workIds), workRepository.listManagedProfiles()]);
  works = works.map((work) => Object.freeze({ ...work, artworkHref: new URL(work.artworkHref, window.location.href).href }));
  selection = createChainedSelectState(works.map((work) => work.id));
  selectorInput.replaceChildren(...profiles.map((profile) => { const option = document.createElement("option"); option.value = profile.id; option.textContent = profile.name; return option; }));
  selectorInput.disabled = profiles.length === 0;
  if (profiles.length === 1) selectorInput.value = profiles[0].id;
  const unavailable = Math.max(0, session.workIds.length - works.length);
  summary.textContent = unavailable ? `${session.workIds.length} WORKS IN SOURCE · ${works.length} AVAILABLE FOR SELECT · ${unavailable} NO LONGER PUBLICLY AVAILABLE` : `${works.length} PUBLIC WORK${works.length === 1 ? "" : "S"} AVAILABLE FOR SELECT`;
  selectorInput.addEventListener("change", render); titleInput.addEventListener("input", () => setStatus()); generateButton.addEventListener("click", () => void generate()); render();
}

initialise().catch(() => { setError("CHAINED SELECT IS CURRENTLY UNAVAILABLE"); generateButton.disabled = true; });
