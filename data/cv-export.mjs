const A4_PAGE = Object.freeze({ width: 595.28, height: 841.89 });
const CHAINED_GREEN = Object.freeze([0, 0.831372549, 0.133333333]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function safeFilenamePart(value) {
  return (text(value) || "artist")
    .toLocaleLowerCase("en")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "artist";
}

function wrapText(value, font, size, maxWidth) {
  const words = text(value).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  return lines;
}

function normalizedCategories(categories = []) {
  return (categories || [])
    .map((category) => {
      const entries = (category?.entries || [])
        .filter((entry) => text(entry?.id) && text(entry?.line))
        .map((entry) => Object.freeze({
          id: text(entry.id),
          yearLabel: text(entry.yearLabel),
          line: text(entry.line),
          isVisible: entry.isVisible === true,
          selected: entry.isVisible === true
        }));
      return Object.freeze({
        id: text(category?.id),
        label: text(category?.label),
        entries: Object.freeze(entries)
      });
    })
    .filter((category) => category.label && category.entries.length);
}

export function createCvExportSelectionState(categories = []) {
  return Object.freeze({
    categories: Object.freeze(normalizedCategories(categories))
  });
}

export function updateCvExportSelection(state, entryId, selected) {
  const targetId = text(entryId);
  if (!targetId || !state?.categories) return state;
  return Object.freeze({
    categories: Object.freeze(state.categories.map((category) => Object.freeze({
      ...category,
      entries: Object.freeze(category.entries.map((entry) => (
        entry.id === targetId
          ? Object.freeze({ ...entry, selected: Boolean(selected) })
          : entry
      )))
    })))
  });
}

export function cvExportSelectionSummary(state) {
  const entries = state?.categories?.flatMap((category) => category.entries) || [];
  const selected = entries.filter((entry) => entry.selected).length;
  return Object.freeze({ available: entries.length, selected, excluded: entries.length - selected });
}

export function selectedCvExportCategories(state) {
  return Object.freeze((state?.categories || [])
    .map((category) => Object.freeze({
      label: category.label,
      entries: Object.freeze(category.entries
        .filter((entry) => entry.selected)
        .map((entry) => Object.freeze({ yearLabel: entry.yearLabel, line: entry.line })))
    }))
    .filter((category) => category.entries.length));
}

export function cvExportFilename(artistName) {
  return `${safeFilenamePart(artistName)}-cv.pdf`;
}

export async function renderCvPdf({ PDFLib, fontkit, fontBytes, artistName, categories } = {}) {
  if (!PDFLib?.PDFDocument || !fontkit || !fontBytes || !text(artistName) || !Array.isArray(categories) || !categories.length) {
    throw new Error("PDF GENERATION IS UNAVAILABLE");
  }

  const { PDFDocument, rgb } = PDFLib;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const black = rgb(0, 0, 0);
  const green = rgb(...CHAINED_GREEN);
  const margin = 54;
  const top = A4_PAGE.height - margin;
  const bottom = margin;
  const yearWidth = 112;
  const lineWidth = A4_PAGE.width - margin * 2 - yearWidth - 20;
  let page;
  let cursor;
  let pageNumber = 0;

  const startPage = (continuation = false) => {
    page = pdf.addPage([A4_PAGE.width, A4_PAGE.height]);
    pageNumber += 1;
    page.drawText(text(artistName), { x: margin, y: top, size: continuation ? 10 : 22, font, color: black });
    page.drawText("CV", { x: margin, y: continuation ? top - 16 : top - 32, size: continuation ? 10 : 13, font, color: green });
    page.drawText(String(pageNumber), { x: A4_PAGE.width - margin, y: 28, size: 8, font, color: black });
    cursor = continuation ? top - 54 : top - 72;
  };

  const entryHeight = (entry) => Math.max(14, wrapText(entry.line, font, 10, lineWidth).length * 14) + 9;
  startPage();

  for (const category of categories) {
    const categoryHeight = 20 + entryHeight(category.entries[0]);
    if (cursor - categoryHeight < bottom) startPage(true);
    page.drawText(text(category.label), { x: margin, y: cursor, size: 11, font, color: black });
    cursor -= 22;

    for (const entry of category.entries) {
      const lines = wrapText(entry.line, font, 10, lineWidth);
      const height = Math.max(14, lines.length * 14) + 9;
      if (cursor - height < bottom) startPage(true);
      if (entry.yearLabel) {
        page.drawText(entry.yearLabel, { x: margin, y: cursor, size: 10, font, color: black });
      }
      lines.forEach((line, index) => {
        page.drawText(line, { x: margin + yearWidth + 20, y: cursor - index * 14, size: 10, font, color: black });
      });
      cursor -= height;
    }
    cursor -= 16;
  }

  return Object.freeze({ bytes: await pdf.save({ useObjectStreams: true }), pageCount: pdf.getPageCount() });
}
