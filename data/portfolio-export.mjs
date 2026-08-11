export const A4_PAGE = Object.freeze({ width: 595.28, height: 841.89 });
export const PORTFOLIO_SAFE_TARGET_BYTES = 19 * 1024 * 1024;
export const PORTFOLIO_MAX_BYTES = 20 * 1024 * 1024;
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
  return [text(work.primaryMedium), text(work.supportBase), text(work.additionalMaterials)]
    .filter(Boolean)
    .join(", ");
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

export async function generateWithinBudget({ renderTier, tiers = PORTFOLIO_IMAGE_TIERS, targetBytes = PORTFOLIO_SAFE_TARGET_BYTES }) {
  if (typeof renderTier !== "function") throw new PortfolioExportError("PDF GENERATION IS UNAVAILABLE");
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
      ? "THIS PORTFOLIO CANNOT MEET THE 20 MB EXPORT LIMIT. REMOVE SOME IMAGES OR WORKS."
      : "THIS PORTFOLIO CANNOT MEET THE MAIL-FRIENDLY EXPORT LIMIT. REMOVE SOME IMAGES OR WORKS."
  );
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
  loadPreparedImage
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
    page.drawText(imagePage.reference, { x: margin, y: margin - 18, size: 9, font, color: black });
  }

  let indexPage = null;
  let cursor = 0;
  const startIndexPage = () => {
    indexPage = pdf.addPage([A4_PAGE.width, A4_PAGE.height]);
    indexPage.drawText("INDEX", { x: margin, y: A4_PAGE.height - margin, size: 11, font, color: black });
    cursor = A4_PAGE.height - margin - 34;
  };
  startIndexPage();

  for (const entry of plan.works) {
    const lineGroups = portfolioMetadataLines(entry.work).map((line) => wrapText(line, font, 10, contentWidth - 42));
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
