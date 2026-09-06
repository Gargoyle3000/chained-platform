import { downloadBlob } from "./browser-download.mjs";

const PDF_MIME_TYPE = "application/pdf";

function hasBytes(value, BlobConstructor) {
  try { return new BlobConstructor([value], { type: PDF_MIME_TYPE }).size > 0; }
  catch { return false; }
}

/**
 * Keeps one generated PDF browser-local until the user explicitly shares or
 * downloads it. No object URL is created until the download action is chosen.
 */
export function createPdfDelivery(data, {
  filename,
  navigatorRef = globalThis.navigator,
  FileConstructor = globalThis.File,
  BlobConstructor = globalThis.Blob,
  download = downloadBlob
} = {}) {
  if (!hasBytes(data, BlobConstructor) || typeof filename !== "string" || !filename.trim()) {
    throw new TypeError("A non-empty PDF and filename are required.");
  }

  let blob = new BlobConstructor([data], { type: PDF_MIME_TYPE });
  let file = typeof FileConstructor === "function"
    ? new FileConstructor([blob], filename, { type: PDF_MIME_TYPE })
    : null;
  let disposed = false;
  let canShareFile = false;
  try {
    canShareFile = Boolean(file
      && typeof navigatorRef?.share === "function"
      && typeof navigatorRef?.canShare === "function"
      && navigatorRef.canShare({ files: [file] }));
  } catch {
    canShareFile = false;
  }

  const available = () => !disposed && blob;
  return Object.freeze({
    filename,
    canShareFile,
    async share() {
      if (!available() || !canShareFile || !file) return Object.freeze({ status: "unavailable" });
      try {
        await navigatorRef.share({ files: [file] });
        return Object.freeze({ status: "shared" });
      } catch (error) {
        return Object.freeze({ status: error?.name === "AbortError" ? "cancelled" : "failed" });
      }
    },
    download() {
      if (!available()) throw new Error("PDF delivery is unavailable.");
      download(blob, { filename, mimeType: PDF_MIME_TYPE });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      file = null;
      blob = null;
    }
  });
}

export const PDF_DELIVERY_MIME_TYPE = PDF_MIME_TYPE;
