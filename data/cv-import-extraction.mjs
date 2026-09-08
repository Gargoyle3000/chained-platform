import { getFrontendRuntime } from "../auth/supabase-client.mjs";
import { normalizeCvImportResult } from "./cv-import-contract.mjs";

export const MAX_CV_IMPORT_PDF_BYTES = 20 * 1024 * 1024;

export class CvImportExtractionError extends Error {
  constructor(code = "cv_import_failed") {
    super(code);
    this.name = "CvImportExtractionError";
    this.code = code;
  }
}

export function validateCvImportPdfFile(file) {
  if (!file || typeof file !== "object") {
    throw new CvImportExtractionError("file_required");
  }

  const name = typeof file.name === "string" ? file.name.trim() : "";
  const type = typeof file.type === "string" ? file.type.trim().toLowerCase() : "";
  const size = Number(file.size);

  if (!name || !/\.pdf$/i.test(name) || (type && type !== "application/pdf")) {
    throw new CvImportExtractionError("invalid_pdf");
  }
  if (!Number.isFinite(size) || size <= 0) {
    throw new CvImportExtractionError("invalid_pdf");
  }
  if (size > MAX_CV_IMPORT_PDF_BYTES) {
    throw new CvImportExtractionError("pdf_too_large");
  }

  return file;
}

export function safeCvImportMessage(error) {
  if (error?.code === "invalid_pdf" || error?.code === "file_required") {
    return "SELECT ONE PDF FILE";
  }
  if (error?.code === "pdf_too_large") {
    return "PDF MUST BE 20 MB OR SMALLER";
  }
  if (error?.code === "cv_import_not_enabled") {
    return "CV IMPORT IS NOT ENABLED FOR THIS ACCOUNT";
  }
  return "CV COULD NOT BE PROCESSED";
}

async function backendErrorCode(error, responseData) {
  let data = responseData && typeof responseData === "object" ? responseData : null;
  const context = error?.context;
  if (!data && context instanceof Response) {
    try {
      data = await context.clone().json();
    } catch {
      data = null;
    }
  } else if (!data && context && typeof context === "object") {
    data = context;
  }
  const code = data?.code;
  return typeof code === "string" && /^[a-z_]+$/.test(code)
    ? code
    : "cv_import_failed";
}

export function createCvImportExtractionService({ invoke }) {
  if (typeof invoke !== "function") {
    throw new Error("CV import extraction invoke dependency is required");
  }

  return Object.freeze({
    async extract(file) {
      validateCvImportPdfFile(file);
      const body = new FormData();
      body.set("pdf", file, file.name);

      const { data, error } = await invoke("cv-import-extract", { body });
      if (error) throw new CvImportExtractionError(await backendErrorCode(error, data));

      try {
        return normalizeCvImportResult(data);
      } catch {
        throw new CvImportExtractionError("invalid_response");
      }
    }
  });
}

export async function getCvImportExtractionService() {
  const runtime = await getFrontendRuntime();
  if (runtime.mode !== "supabase") {
    throw new CvImportExtractionError("cv_import_unavailable");
  }
  return createCvImportExtractionService({
    invoke: runtime.client.functions.invoke.bind(runtime.client.functions)
  });
}
