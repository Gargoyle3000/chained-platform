const DEFAULT_REVOKE_DELAY_MS = 1000;

function byteLength(value) {
  if (value instanceof Blob) return value.size;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (Array.isArray(value)) return value.length;
  return 0;
}

export function downloadBlob(data, {
  mimeType = "application/pdf",
  filename,
  documentRef = globalThis.document,
  urlApi = globalThis.URL,
  setTimeoutFn = globalThis.setTimeout,
  revokeDelayMs = DEFAULT_REVOKE_DELAY_MS
} = {}) {
  if (!byteLength(data) || typeof filename !== "string" || !filename.trim()) {
    throw new TypeError("A non-empty download and filename are required.");
  }
  if (!documentRef?.body || typeof documentRef.createElement !== "function") {
    throw new Error("Browser document is unavailable.");
  }
  if (!urlApi || typeof urlApi.createObjectURL !== "function" || typeof urlApi.revokeObjectURL !== "function") {
    throw new Error("Browser URL API is unavailable.");
  }
  if (typeof setTimeoutFn !== "function") throw new Error("Browser timer is unavailable.");

  const blob = new Blob([data], { type: mimeType === "application/pdf" ? mimeType : "application/pdf" });
  if (!blob.size) throw new TypeError("A non-empty download is required.");
  const url = urlApi.createObjectURL(blob);
  const link = documentRef.createElement("a");
  link.href = url;
  link.download = filename;
  documentRef.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeoutFn(() => urlApi.revokeObjectURL(url), Math.max(0, Number(revokeDelayMs) || 0));
  }
}

export const BROWSER_DOWNLOAD_REVOKE_DELAY_MS = DEFAULT_REVOKE_DELAY_MS;
