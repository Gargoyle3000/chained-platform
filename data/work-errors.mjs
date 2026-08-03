export const WORK_ERROR_CODES = Object.freeze({
  CONFLICT: "conflict",
  INVALID: "invalid",
  NOT_FOUND: "not_found",
  UNAVAILABLE: "unavailable",
  UNAUTHORIZED: "unauthorized"
});

export class WorkError extends Error {
  constructor(code, message, cause) {
    super(message, { cause });
    this.name = "WorkError";
    this.code = code;
  }
}

export function sanitizeWorkError(error, fallback = "WORK IS CURRENTLY UNAVAILABLE") {
  if (error instanceof WorkError) return error;

  const status = Number(error?.status || error?.context?.status || 0);
  const code = String(error?.code || "");
  if (status === 401 || status === 403 || code === "42501") {
    return new WorkError(WORK_ERROR_CODES.UNAUTHORIZED, "THIS WORK IS NOT AVAILABLE", error);
  }
  if (status === 404 || code === "PGRST116") {
    return new WorkError(WORK_ERROR_CODES.NOT_FOUND, "THIS WORK IS NOT AVAILABLE", error);
  }
  if (status === 409 || code === "23505") {
    return new WorkError(WORK_ERROR_CODES.CONFLICT, "THIS WORK CHANGED ELSEWHERE", error);
  }
  return new WorkError(WORK_ERROR_CODES.UNAVAILABLE, fallback, error);
}

