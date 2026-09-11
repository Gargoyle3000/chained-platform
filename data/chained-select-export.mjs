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

const CHAINED_GREEN = "#00FC28";

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
    portfolioDimensions(work)
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
    accentColor: CHAINED_GREEN,
    titlePageTextColor: (value, index, black, accent) => index === 0 ? accent : black,
    titlePageLineParts: (value, index, black, accent) => index === 3 ? [
      { text: "SELECTED BY ", color: black },
      { text: text(selectorName), color: accent }
    ] : null,
    imagePageCaptionParts: (entry, black, accent) => [
      { text: `${entry.reference} · `, color: black },
      { text: text(entry.work.artistName) || "ARTIST", color: accent }
    ],
    indexHeading: "<CHAINED> SELECT",
    metadataLines: chainedSelectMetadataLines,
    indexLineColor: (line, entry, black, accent) => line === (text(entry.work.artistName) || "ARTIST") ? accent : black
  });
}
