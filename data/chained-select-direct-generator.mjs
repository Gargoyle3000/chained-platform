import { downloadBlob } from "./browser-download.mjs";
import { createPortfolioSourceCache, generateWithinBudget, PortfolioExportError } from "./portfolio-export.mjs";
import { chainedSelectFilename, createChainedSelectPlan, renderChainedSelectPdf } from "./chained-select-export.mjs";
import { chainedSelectLimit, revalidateProjectChainedSelect } from "./chained-select-direct-export.mjs";
import { applyExportImageSelection } from "./export-image-selection-state.mjs";

const FONT_URL = "assets/fonts/CascadiaCode-Regular.ttf";

async function imageFromBlob(blob, { URL: URLApi = URL, Image: ImageConstructor = Image } = {}) {
  const url = URLApi.createObjectURL(blob);
  try {
    const image = new ImageConstructor();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("image unavailable");
    return image;
  } finally {
    URLApi.revokeObjectURL(url);
  }
}

async function prepareImage(image, tier, cache, environment = globalThis) {
  let canvas;
  try {
    const decoded = await imageFromBlob(await cache.get(image), environment);
    const scale = Math.min(1, tier.maxDimension / Math.max(decoded.naturalWidth, decoded.naturalHeight));
    canvas = environment.document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(decoded.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(decoded.naturalHeight * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("canvas unavailable");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(decoded, 0, 0, canvas.width, canvas.height);
    decoded.src = "";
    const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("encode failed")), "image/jpeg", tier.jpegQuality));
    return Object.freeze({ mimeType: "image/jpeg", bytes: new Uint8Array(await blob.arrayBuffer()) });
  } catch {
    throw new PortfolioExportError("ONE OR MORE PUBLIC IMAGES COULD NOT BE PREPARED FOR SELECT");
  } finally {
    if (canvas) { canvas.width = 1; canvas.height = 1; }
  }
}

export async function generateProjectChainedSelect({
  repository,
  project,
  workIds,
  selectorName,
  imageSelection = null,
  setStatus = () => {},
  environment = globalThis,
  fontUrl = FONT_URL
} = {}) {
  if (!selectorName) throw new PortfolioExportError("SELECTOR IDENTITY IS CURRENTLY UNAVAILABLE");
  setStatus("VALIDATING PUBLIC WORKS");
  const revalidated = await revalidateProjectChainedSelect({ repository, workIds });
  if (revalidated.unavailableIds.length) return Object.freeze({ status: "changed", unavailableIds: revalidated.unavailableIds });
  const selectedWorks = imageSelection ? applyExportImageSelection(revalidated.works, imageSelection) : revalidated.works;
  if (selectedWorks.length !== revalidated.works.length) return Object.freeze({ status: "changed", unavailableIds: revalidated.works.filter((work) => !selectedWorks.some((entry) => entry.id === work.id)).map((work) => work.id) });
  const limit = chainedSelectLimit(selectedWorks);
  if (!limit.valid) return Object.freeze({ status: "limit", limit });
  if (!environment.PDFLib || !environment.fontkit) throw new PortfolioExportError("PDF GENERATION IS CURRENTLY UNAVAILABLE");

  setStatus(`PREPARING ${limit.workCount} ${limit.workCount === 1 ? "WORK" : "WORKS"} / ${limit.imageCount} ${limit.imageCount === 1 ? "IMAGE" : "IMAGES"}`);
  const plan = createChainedSelectPlan(selectedWorks);
  let fontBytesPromise;
  const fontBytes = () => {
    if (!fontBytesPromise) fontBytesPromise = environment.fetch(fontUrl).then((response) => response.ok ? response.arrayBuffer() : Promise.reject(new Error("font unavailable")));
    return fontBytesPromise;
  };
  const cache = createPortfolioSourceCache(async ([image]) => {
    const response = await environment.fetch(image.src, { cache: "no-store" });
    if (!response.ok) throw new Error("public image unavailable");
    const blob = await response.blob();
    if (!blob.size) throw new Error("empty public image");
    return [{ imageId: image.id, blob }];
  });
  try {
    setStatus("FETCHING PUBLIC IMAGES");
    await cache.prepare();
    await cache.preload(plan.imagePages.map((entry) => entry.image));
    let renderCount = 0;
    const output = await generateWithinBudget({
      failureSubject: "SELECT",
      renderTier: async (tier) => {
        renderCount += 1;
        setStatus(renderCount === 1 ? "GENERATING PDF" : "COMPRESSING IMAGES");
        return renderChainedSelectPdf({
          PDFLib: environment.PDFLib,
          fontkit: environment.fontkit,
          fontBytes: await fontBytes(),
          plan,
          title: project?.title,
          selectorName,
          tier,
          loadPreparedImage: (image, currentTier) => prepareImage(image, currentTier, cache, environment)
        });
      }
    });
    downloadBlob(output.bytes, { filename: chainedSelectFilename(project?.title), documentRef: environment.document, urlApi: environment.URL, setTimeoutFn: environment.setTimeout });
    setStatus("READY · DOWNLOAD COMPLETE");
    return Object.freeze({ status: "ready", output, works: selectedWorks });
  } finally {
    try {
      await cache.clear();
    } catch {
      // The browser-local cleanup must not turn a completed download into a failure.
    }
  }
}
