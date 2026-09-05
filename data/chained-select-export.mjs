import {
  createPortfolioPlan,
  portfolioDimensions,
  portfolioMaterials,
  PortfolioExportError,
  renderPortfolioPdf
} from "./portfolio-export.mjs";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function createChainedSelectPlan(works = []) {
  return createPortfolioPlan(works);
}

export function chainedSelectFilename(title = "") {
  const safe = (text(title) || "chained select")
    .toLocaleLowerCase("en")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${safe || "chained-select"}.pdf`;
}

export function chainedSelectMetadataLines(work = {}) {
  const title = text(work.title) || "UNTITLED";
  const year = text(work.year);
  const format = text(work.format) || text(work.workType);
  return Object.freeze([
    text(work.artistName) || "ARTIST",
    [title, year].filter(Boolean).join(", "),
    format && format.replaceAll("-", " ").toUpperCase(),
    portfolioMaterials(work),
    portfolioDimensions(work),
    text(work.artworkHref)
  ].filter(Boolean));
}

export async function renderChainedSelectPdf({
  PDFLib,
  fontkit,
  fontBytes,
  plan,
  title,
  selectorName,
  tier,
  loadPreparedImage
}) {
  if (!text(selectorName)) throw new PortfolioExportError("SELECTOR IDENTITY IS CURRENTLY UNAVAILABLE");
  return renderPortfolioPdf({
    PDFLib,
    fontkit,
    fontBytes,
    plan,
    artistName: "",
    documentTitle: text(title),
    includeTitlePage: true,
    tier,
    loadPreparedImage,
    titlePageLines: ["<CHAINED>", "SELECT", text(title) || "UNTITLED SELECT", `SELECTED BY ${text(selectorName)}`],
    imagePageCaption: (entry) => `${entry.reference} · ${text(entry.work.artistName) || "ARTIST"}`,
    indexHeading: "<CHAINED> SELECT",
    metadataLines: chainedSelectMetadataLines
  });
}
