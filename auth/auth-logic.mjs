export const DEFAULT_DASHBOARD_PAGE = "dashboard.html";

export const PROTECTED_DASHBOARD_PAGES = Object.freeze([
  "dashboard.html",
  "dashboard-works.html",
  "dashboard-work-edit.html",
  "following.html",
  "archive.html",
  "archive-project.html",
  "agenda.html"
]);

const PROTECTED_PAGE_SET = new Set(PROTECTED_DASHBOARD_PAGES);

export const GENERIC_LOGIN_CONFIRMATION =
  "IF THIS EMAIL IS ADMITTED, A SIGN-IN LINK HAS BEEN SENT.";

export const NEXT_PAGE_STORAGE_KEY = "chained-auth-next-page";

export function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (
    email.length < 3 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return null;
  }
  return email;
}

export function resolveNextPage(value) {
  if (typeof value !== "string") return DEFAULT_DASHBOARD_PAGE;

  const candidate = value.trim();
  if (
    !candidate ||
    /[\u0000-\u001f\u007f\\#%]/.test(candidate) ||
    candidate.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(candidate)
  ) {
    return DEFAULT_DASHBOARD_PAGE;
  }

  const relative = candidate.startsWith("/") ? candidate.slice(1) : candidate;
  const queryIndex = relative.indexOf("?");
  const pathname = queryIndex === -1 ? relative : relative.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : relative.slice(queryIndex + 1);

  if (
    !PROTECTED_PAGE_SET.has(pathname) ||
    pathname.includes("/") ||
    pathname.includes("..")
  ) {
    return DEFAULT_DASHBOARD_PAGE;
  }

  if (!query) return pathname;
  if (!["dashboard-work-edit.html", "archive-project.html"].includes(pathname)) {
    return DEFAULT_DASHBOARD_PAGE;
  }

  const parameters = new URLSearchParams(query);
  const keys = [...parameters.keys()];
  const id = parameters.get("id");
  if (
    keys.length !== 1 ||
    keys[0] !== "id" ||
    parameters.getAll("id").length !== 1 ||
    !id ||
    !(pathname === "dashboard-work-edit.html"
      ? /^[A-Za-z0-9-]{1,120}$/.test(id)
      : /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
  ) {
    return DEFAULT_DASHBOARD_PAGE;
  }

  return `${pathname}?id=${encodeURIComponent(id)}`;
}

export function accountAccessDecision(account) {
  if (!account || typeof account !== "object") return "missing";
  if (account.status === "active") return "active";
  if (account.status === "suspended") return "suspended";
  if (account.status === "disabled") return "disabled";
  return "invalid";
}

export function mapLoginResult() {
  return Object.freeze({
    kind: "generic-success",
    message: GENERIC_LOGIN_CONFIRMATION
  });
}

export function sanitizeCallbackError(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "THE SIGN-IN LINK COULD NOT BE COMPLETED.";
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.includes("expired")) {
    return "THIS SIGN-IN LINK HAS EXPIRED. REQUEST A NEW LINK.";
  }

  return "THE SIGN-IN LINK IS INVALID OR HAS ALREADY BEEN USED.";
}
