import { materialDisplayValues } from "./material-terms.mjs";

export const A4_PAGE = Object.freeze({ width: 595.28, height: 841.89 });
export const PORTFOLIO_SAFE_TARGET_BYTES = 19 * 1024 * 1024;
export const PORTFOLIO_MAX_BYTES = 20 * 1024 * 1024;
export const PORTFOLIO_SOURCE_MEMORY_BYTES = 256 * 1024 * 1024;
export const PORTFOLIO_MAX_SOURCE_BYTES = 50 * 1024 * 1024;
export const PORTFOLIO_IMAGE_TIERS = Object.freeze([
  Object.freeze({ id: "standard", maxDimension: 2600, jpegQuality: 0.9 }),
  Object.freeze({ id: "compact", maxDimension: 2200, jpegQuality: 0.84 }),
  Object.freeze({ id: "compressed", maxDimension: 1850, jpegQuality: 0.78 }),
  Object.freeze({ id: "minimum", maxDimension: 1550, jpegQuality: 0.72 })
]);

export class PortfolioExportError extends Error {
  constructor(message) {
    super(message);
    this.name = "PortfolioExportError";
  }
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function padReference(value) {
  return String(value).padStart(2, "0");
}

function secondaryImageLetter(index) {
  return String.fromCharCode(65 + index);
}

function orderedImages(work) {
  return [...(work?.images || [])]
    .filter((image) => image?.id && image.uploadStatus === "ready")
    .sort((first, second) => first.order - second.order || String(first.id).localeCompare(String(second.id), "en"));
}

export function createPortfolioPlan(works = []) {
  const selectedWorks = [];
  const imagePages = [];

  works.forEach((work) => {
    const images = orderedImages(work);
    if (!work?.id || !images.length) return;
    const number = padReference(selectedWorks.length + 1);
    const entry = Object.freeze({ work, number, images: Object.freeze(images) });
    selectedWorks.push(entry);
    images.forEach((image, imageIndex) => {
      imagePages.push(Object.freeze({
        work,
        image,
        workNumber: number,
        reference: images.length === 1 ? number : `${number}${secondaryImageLetter(imageIndex)}`
      }));
    });
  });

  return Object.freeze({
    works: Object.freeze(selectedWorks),
    imagePages: Object.freeze(imagePages)
  });
}

export function portfolioMaterials(work = {}) {
  const values = Object.hasOwn(work, "materials")
    ? materialDisplayValues(work.materials)
    : materialDisplayValues([
      work.primaryMedium,
      work.supportBase,
      work.additionalMaterials
    ]);
  return values.join(", ");
}

export function portfolioDimensions(work = {}) {
  const values = [text(work.height), text(work.width), text(work.depth)].filter(Boolean);
  if (!values.length) return "";
  const unit = text(work.dimensionUnit).toUpperCase();
  return `${values.join(" × ")}${unit ? ` ${unit}` : ""}`;
}

export function portfolioMetadataLines(work = {}) {
  const title = text(work.title) || "UNTITLED";
  const titleLine = [title, text(work.year)].filter(Boolean).join(", ");
  const format = text(work.format) || text(work.workType);
  const lines = [
    titleLine,
    format && format.replaceAll("-", " ").toUpperCase(),
    portfolioMaterials(work),
    portfolioDimensions(work),
    text(work.duration) && `DURATION: ${text(work.duration)}`,
    text(work.edition) && `EDITION: ${text(work.edition)}`,
    text(work.collaboratorName) && `COLLABORATOR: ${text(work.collaboratorName)}`,
    text(work.photoCreditName) && `PHOTO CREDIT: ${text(work.photoCreditName)}`,
    text(work.description)
  ].filter(Boolean);
  return Object.freeze(lines);
}

export function portfolioFilename(artistName, title = "") {
  const candidate = text(title) || `${text(artistName) || "artist"} visual portfolio`;
  const slug = candidate
    .toLocaleLowerCase("en")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${slug || "visual-portfolio"}.pdf`;
}

export function fitIntoBox(width, height, boxWidth, boxHeight) {
  const sourceWidth = Number(width);
  const sourceHeight = Number(height);
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
    throw new PortfolioExportError("IMAGE DIMENSIONS ARE INVALID");
  }
  const scale = Math.min(boxWidth / sourceWidth, boxHeight / sourceHeight, 1);
  return Object.freeze({ width: sourceWidth * scale, height: sourceHeight * scale, scale });
}

export async function generateWithinBudget({ renderTier, tiers = PORTFOLIO_IMAGE_TIERS, targetBytes = PORTFOLIO_SAFE_TARGET_BYTES, failureSubject = "PORTFOLIO" }) {
  if (typeof renderTier !== "function") throw new PortfolioExportError("PDF GENERATION IS UNAVAILABLE");
  const subject = failureSubject === "SELECT" ? "SELECT" : "PORTFOLIO";
  let lastResult = null;
  for (const tier of tiers) {
    const result = await renderTier(tier);
    const size = Number(result?.bytes?.byteLength);
    if (!Number.isFinite(size) || size <= 0) throw new PortfolioExportError("PDF GENERATION FAILED");
    lastResult = Object.freeze({ ...result, tier, size });
    if (size <= targetBytes) return lastResult;
  }
  throw new PortfolioExportError(
    lastResult && lastResult.size > PORTFOLIO_MAX_BYTES
      ? `THIS ${subject} CANNOT MEET THE 20 MB EXPORT LIMIT. REMOVE SOME IMAGES OR WORKS.`
      : `THIS ${subject} CANNOT MEET THE MAIL-FRIENDLY EXPORT LIMIT. REMOVE SOME IMAGES OR WORKS.`
  );
}

const PORTFOLIO_SOURCE_STORE_DATABASE = "chained-portfolio-export-sources";
const PORTFOLIO_SOURCE_STORE_NAME = "sources";
const PORTFOLIO_SOURCE_STORE_STALE_MS = 60 * 60 * 1000;

function portfolioSourceError() {
  return new PortfolioExportError("ONE OR MORE IMAGES COULD NOT BE PREPARED FOR EXPORT");
}

function idbResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error || new Error("IndexedDB request failed.")), { once: true });
  });
}

function idbComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", resolve, { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error || new Error("IndexedDB transaction aborted.")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error || new Error("IndexedDB transaction failed.")), { once: true });
  });
}

function portfolioSourceSessionId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createPortfolioSourceStore({
  indexedDb = globalThis.indexedDB,
  now = () => Date.now(),
  sessionId = portfolioSourceSessionId(),
  staleAfterMs = PORTFOLIO_SOURCE_STORE_STALE_MS
} = {}) {
  if (!indexedDb?.open) throw portfolioSourceError();
  let databasePromise = null;
  let prepared = false;

  const database = () => {
    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
        const request = indexedDb.open(PORTFOLIO_SOURCE_STORE_DATABASE, 1);
        request.addEventListener("upgradeneeded", () => {
          const store = request.result.createObjectStore(PORTFOLIO_SOURCE_STORE_NAME, { keyPath: ["sessionId", "imageId"] });
          store.createIndex("createdAt", "createdAt", { unique: false });
        }, { once: true });
        request.addEventListener("success", () => resolve(request.result), { once: true });
        request.addEventListener("error", () => reject(request.error || new Error("IndexedDB is unavailable.")), { once: true });
      });
    }
    return databasePromise;
  };

  const removeStaleSources = async (db) => {
    const cutoff = now() - staleAfterMs;
    const transaction = db.transaction(PORTFOLIO_SOURCE_STORE_NAME, "readwrite");
    const completed = idbComplete(transaction);
    const index = transaction.objectStore(PORTFOLIO_SOURCE_STORE_NAME).index("createdAt");
    const request = index.openCursor();
    let cursor = await idbResult(request);
    while (cursor) {
      if (Number(cursor.value?.createdAt) < cutoff) cursor.delete();
      cursor.continue();
      cursor = await idbResult(request);
    }
    await completed;
  };

  const prepare = async () => {
    const db = await database();
    if (!prepared) {
      await removeStaleSources(db);
      prepared = true;
    }
    return db;
  };

  const removeCurrentSession = async (db) => {
    const transaction = db.transaction(PORTFOLIO_SOURCE_STORE_NAME, "readwrite");
    const completed = idbComplete(transaction);
    const store = transaction.objectStore(PORTFOLIO_SOURCE_STORE_NAME);
    const request = store.openCursor();
    let cursor = await idbResult(request);
    while (cursor) {
      if (cursor.value?.sessionId === sessionId) cursor.delete();
      cursor.continue();
      cursor = await idbResult(request);
    }
    await completed;
  };

  return Object.freeze({
    async prepare() {
      await prepare();
    },
    async put(imageId, blob) {
      const db = await prepare();
      const transaction = db.transaction(PORTFOLIO_SOURCE_STORE_NAME, "readwrite");
      const completed = idbComplete(transaction);
      transaction.objectStore(PORTFOLIO_SOURCE_STORE_NAME).put({ sessionId, imageId, createdAt: now(), blob });
      await completed;
    },
    async get(imageId) {
      const db = await prepare();
      const transaction = db.transaction(PORTFOLIO_SOURCE_STORE_NAME, "readonly");
      const completed = idbComplete(transaction);
      const record = await idbResult(transaction.objectStore(PORTFOLIO_SOURCE_STORE_NAME).get([sessionId, imageId]));
      await completed;
      return record?.blob || null;
    },
    async close() {
      if (!databasePromise) return;
      try { (await databasePromise).close(); }
      catch { /* Best-effort housekeeping cleanup. */ }
    },
    async clear() {
      if (!databasePromise) return;
      const db = await databasePromise;
      try { await removeCurrentSession(db); }
      finally { db.close(); }
    }
  });
}

export function createPortfolioSourceCache(loadSources, {
  maxBytes = PORTFOLIO_SOURCE_MEMORY_BYTES,
  maxSourceBytes = PORTFOLIO_MAX_SOURCE_BYTES,
  sourceStoreFactory = () => createPortfolioSourceStore()
} = {}) {
  if (typeof loadSources !== "function") throw new PortfolioExportError("PDF GENERATION IS UNAVAILABLE");
  if (!Number.isFinite(maxBytes) || !Number.isFinite(maxSourceBytes) || maxBytes < maxSourceBytes || maxSourceBytes <= 0) {
    throw new PortfolioExportError("PDF GENERATION IS UNAVAILABLE");
  }
  const sources = new Map();
  const storedSourceIds = new Set();
  const acquisitions = new Map();
  const memoryLimit = maxBytes - maxSourceBytes;
  let storedBytes = 0;
  let sourceStore = null;
  let released = false;

  const uniqueImages = (images) => {
    const values = Array.isArray(images) ? images : [images];
    const seen = new Set();
    return values.filter((image) => {
      const id = typeof image?.id === "string" ? image.id : "";
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  };

  const requireImageId = (image) => {
    const imageId = typeof image?.id === "string" ? image.id : "";
    if (!imageId) throw portfolioSourceError();
    return imageId;
  };

  const ensureStore = () => {
    if (!sourceStore) {
      try { sourceStore = sourceStoreFactory(); }
      catch { throw portfolioSourceError(); }
    }
    if (!sourceStore || typeof sourceStore.put !== "function" || typeof sourceStore.get !== "function" || typeof sourceStore.clear !== "function") {
      throw portfolioSourceError();
    }
    return sourceStore;
  };

  const acquire = async (image) => {
    if (released) throw new PortfolioExportError("PDF GENERATION IS UNAVAILABLE");
    const imageId = requireImageId(image);
    if (sources.has(imageId) || storedSourceIds.has(imageId)) return;
    if (acquisitions.has(imageId)) return acquisitions.get(imageId);

    const acquisition = (async () => {
      const loaded = await loadSources([image]);
      if (!Array.isArray(loaded) || loaded.length !== 1) throw portfolioSourceError();
      const source = loaded[0];
      if (source?.imageId !== imageId || !source?.blob || typeof source.blob.arrayBuffer !== "function") throw portfolioSourceError();
      const size = Number(source.blob.size);
      if (!Number.isFinite(size) || size <= 0 || size > maxSourceBytes) throw portfolioSourceError();

      if (storedBytes + size <= memoryLimit) {
        sources.set(imageId, source.blob);
        storedBytes += size;
        return;
      }

      try {
        await ensureStore().put(imageId, source.blob);
      } catch {
        throw portfolioSourceError();
      }
      storedSourceIds.add(imageId);
    })();
    acquisitions.set(imageId, acquisition);
    try { await acquisition; }
    finally { acquisitions.delete(imageId); }
  };

  return Object.freeze({
    async prepare() {
      try {
        const store = ensureStore();
        if (typeof store.prepare === "function") await store.prepare();
      } catch {
        const failedStore = sourceStore;
        sourceStore = null;
        try { await failedStore?.close?.(); }
        catch { /* Housekeeping remains best-effort. */ }
      }
    },
    async preload(images) {
      for (const image of uniqueImages(images)) await acquire(image);
    },
    async get(image) {
      const imageId = requireImageId(image);
      await acquire(image);
      if (sources.has(imageId)) return sources.get(imageId);
      if (!storedSourceIds.has(imageId)) throw portfolioSourceError();
      let blob;
      try { blob = await ensureStore().get(imageId); }
      catch { throw portfolioSourceError(); }
      if (!blob || typeof blob.arrayBuffer !== "function") throw portfolioSourceError();
      return blob;
    },
    async clear() {
      sources.clear();
      storedSourceIds.clear();
      storedBytes = 0;
      released = true;
      if (sourceStore) {
        try { await sourceStore.clear(); }
        catch { throw portfolioSourceError(); }
      }
    }
  });
}

function wrapText(value, font, size, width) {
  const words = text(value).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(candidate, size) > width) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });
  if (line) lines.push(line);
  return lines;
}

export async function renderPortfolioPdf({
  PDFLib,
  fontkit,
  fontBytes,
  plan,
  artistName,
  documentTitle,
  includeTitlePage,
  tier,
  loadPreparedImage,
  titlePageLines = null,
  imagePageCaption = (entry) => entry.reference,
  indexHeading = "INDEX",
  metadataLines = portfolioMetadataLines
}) {
  if (!PDFLib?.PDFDocument || !fontkit || !fontBytes || !plan?.works?.length || typeof loadPreparedImage !== "function") {
    throw new PortfolioExportError("PDF GENERATION IS UNAVAILABLE");
  }

  const { PDFDocument, rgb } = PDFLib;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const black = rgb(0, 0, 0);
  const margin = 54;
  const contentWidth = A4_PAGE.width - margin * 2;
  const contentHeight = A4_PAGE.height - margin * 2;

  if (includeTitlePage) {
    const page = pdf.addPage([A4_PAGE.width, A4_PAGE.height]);
    if (Array.isArray(titlePageLines)) {
      let titleY = A4_PAGE.height / 2 + 44;
      titlePageLines.filter(Boolean).forEach((value, index) => {
        const size = index < 2 ? 18 : 12;
        wrapText(value, font, size, contentWidth).forEach((line) => {
          page.drawText(line, { x: margin, y: titleY, size, font, color: black });
          titleY -= index < 2 ? 27 : 20;
        });
        titleY -= 8;
      });
    } else {
      const artist = text(artistName) || "ARTIST";
      const artistSize = 24;
      const titleSize = 16;
      page.drawText(artist, { x: margin, y: A4_PAGE.height / 2 + 22, size: artistSize, font, color: black });
      let titleY = A4_PAGE.height / 2 - 18;
      wrapText(documentTitle, font, titleSize, contentWidth).forEach((line) => {
        page.drawText(line, { x: margin, y: titleY, size: titleSize, font, color: black });
        titleY -= 25;
      });
    }
  }

  for (const imagePage of plan.imagePages) {
    const prepared = await loadPreparedImage(imagePage.image, tier);
    const image = prepared.mimeType === "image/png"
      ? await pdf.embedPng(prepared.bytes)
      : await pdf.embedJpg(prepared.bytes);
    const page = pdf.addPage([A4_PAGE.width, A4_PAGE.height]);
    const numberSpace = 28;
    const fitted = fitIntoBox(image.width, image.height, contentWidth, contentHeight - numberSpace);
    page.drawImage(image, {
      x: margin + (contentWidth - fitted.width) / 2,
      y: margin + numberSpace + (contentHeight - numberSpace - fitted.height) / 2,
      width: fitted.width,
      height: fitted.height
    });
    page.drawText(text(imagePageCaption(imagePage)) || imagePage.reference, { x: margin, y: margin - 18, size: 9, font, color: black });
  }

  let indexPage = null;
  let cursor = 0;
  const startIndexPage = () => {
    indexPage = pdf.addPage([A4_PAGE.width, A4_PAGE.height]);
    indexPage.drawText(text(indexHeading) || "INDEX", { x: margin, y: A4_PAGE.height - margin, size: 11, font, color: black });
    cursor = A4_PAGE.height - margin - 34;
  };
  startIndexPage();

  for (const entry of plan.works) {
    const lineGroups = metadataLines(entry.work).map((line) => wrapText(line, font, 10, contentWidth - 42));
    const entryHeight = 14 + lineGroups.reduce((sum, lines) => sum + lines.length * 14, 0) + 14;
    if (cursor - entryHeight < margin) startIndexPage();
    indexPage.drawText(entry.number, { x: margin, y: cursor, size: 10, font, color: black });
    let lineY = cursor;
    lineGroups.forEach((lines) => lines.forEach((line) => {
      indexPage.drawText(line, { x: margin + 42, y: lineY, size: 10, font, color: black });
      lineY -= 14;
    }));
    cursor = lineY - 14;
  }

  const bytes = await pdf.save({ useObjectStreams: true });
  return Object.freeze({ bytes, pageCount: pdf.getPageCount() });
}
