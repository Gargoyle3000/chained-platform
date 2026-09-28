import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

class TestElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
  }

  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  addEventListener(name, callback) { this.listeners.set(name, callback); }
  click(event = { preventDefault() {} }) { this.listeners.get("click")?.(event); }
}

test("rendered ready Work row has distinct DETAILS, PUBLISH and NOT NOW actions", async () => {
  const script = await readFile(new URL("../dashboard-overview.js", import.meta.url), "utf8");
  const start = script.indexOf("  function createRequestAction(");
  const end = script.indexOf("  function renderRequests(", start);
  assert.ok(start >= 0 && end > start, "Dashboard ready-row renderer is available");

  const events = [];
  const inFlight = new Set();
  const createRequestRow = runInNewContext(
    `${script.slice(start, end)}\ncreateRequestRow`,
    {
      document: { createElement: (tagName) => new TestElement(tagName) },
      requestActionInFlight: inFlight,
      publishReadyWork: () => events.push("publish")
    }
  );
  const request = {
    kind: "work_ready_to_publish",
    workId: "ready-work",
    workTitle: "yolo",
    href: "dashboard-work-edit.html?id=ready-work"
  };
  const row = createRequestRow(request, () => events.push("decision"), () => events.push("acknowledge"));
  const [summary, actions] = row.children;
  const [details, publish, notNow] = actions.children;

  assert.equal(summary.textContent, "WORK READY TO PUBLISH — yolo");
  assert.deepEqual(actions.children.map((action) => action.textContent), [
    "[ DETAILS ]", "[ PUBLISH ]", "[ NOT NOW ]"
  ]);
  assert.equal(details.tagName, "a");
  assert.equal(details.href, request.href);
  assert.equal(publish.tagName, "button");
  assert.equal(notNow.tagName, "button");
  details.click();
  assert.deepEqual(events, [], "reviewing Details does not publish or acknowledge");
  publish.click();
  notNow.click();
  assert.deepEqual(events, ["publish", "acknowledge"]);
});

test("Dashboard intro uses a static plus marker and preserves identity hydration", async () => {
  const page = await readFile(new URL("../dashboard.html", import.meta.url), "utf8");

  assert.match(page, /class="dashboard-page-marker" aria-hidden="true">\+<\/div>/);
  assert.doesNotMatch(page, /<h1[^>]*>\s*DASHBOARD\s*<\/h1>/);
  assert.match(page, /data-dashboard-profile-name/);
  assert.match(page, /data-dashboard-account-type>ARTIST ACCOUNT/);
  assert.match(page, /class="dashboard-link is-active"[\s\S]*href="dashboard\.html"/);
});

test("management pages share the static workspace identity and concise headings", async () => {
  const pages = [
    "dashboard-agenda-edit.html",
    "dashboard-agenda.html",
    "dashboard-cv.html",
    "dashboard-portfolio-export.html",
    "dashboard-presentation-edit.html",
    "dashboard-presentations.html",
    "dashboard-press.html",
    "dashboard-settings.html",
    "dashboard-work-edit.html",
    "dashboard-works.html"
  ];

  for (const filename of pages) {
    const page = await readFile(new URL(`../${filename}`, import.meta.url), "utf8");
    assert.match(page, /class="dashboard-page-marker" aria-hidden="true">\+<\/div>/, filename);
    assert.doesNotMatch(page, /<h1[^>]*>\s*DASHBOARD\s*<\/h1>/, filename);
    assert.match(page, /data-dashboard-profile-name[\s\S]*PROFILE LOADING/, filename);
    assert.match(page, /data-dashboard-account-type[\s\S]*ARTIST ACCOUNT/, filename);
  }

  const works = await readFile(new URL("../dashboard-works.html", import.meta.url), "utf8");
  const presentations = await readFile(new URL("../dashboard-presentations.html", import.meta.url), "utf8");
  const agenda = await readFile(new URL("../dashboard-agenda.html", import.meta.url), "utf8");
  assert.match(works, /<h2>WORKS<\/h2>/);
  assert.match(presentations, /<h2>PRESENTATIONS<\/h2>/);
  assert.match(agenda, /<h2>AGENDA<\/h2>/);
  assert.doesNotMatch(works, /MANAGE YOUR WORKS/);
  assert.doesNotMatch(presentations, /MANAGE YOUR PRESENTATIONS/);
  assert.doesNotMatch(agenda, /MANAGE YOUR AGENDA/);
});

test("prototype identity and local errors avoid implementation prefixes", async () => {
  const context = await readFile(new URL("../data/dashboard-context.mjs", import.meta.url), "utf8");
  const login = await readFile(new URL("../auth/login.mjs", import.meta.url), "utf8");
  const workForm = await readFile(new URL("../dashboard-form.js", import.meta.url), "utf8");
  assert.doesNotMatch(context, /LOCAL PROTOTYPE/);
  assert.match(context, /PROFILE SETUP REQUIRED/);
  assert.doesNotMatch(login, /LOCAL AUTHENTICATION CONFIGURATION/);
  assert.match(login, /AUTHENTICATION IS UNAVAILABLE/);
  assert.doesNotMatch(workForm, /LOCAL WORK STORAGE/);
  assert.match(workForm, /WORK SAVING IS CURRENTLY UNAVAILABLE/);
});

test("prototype fallback copy stays product-facing", async () => {
  const sources = await Promise.all([
    "auth/callback.mjs",
    "auth/guard.mjs",
    "auth/login.mjs",
    "auth/password-update.mjs",
    "dashboard-agenda.js",
    "dashboard-cv.js",
    "dashboard-form.js",
    "dashboard-presentations.js",
    "dashboard-press.js",
    "data/agenda-repository.mjs",
    "data/cv-repository.mjs",
    "data/presentation-repository.mjs",
    "data/press-repository.mjs",
    "data/settings-repository.mjs"
  ].map((filename) => readFile(new URL(`../${filename}`, import.meta.url), "utf8")));
  const copy = sources.join("\n");

  assert.match(copy, /SIGN-IN IS CURRENTLY UNAVAILABLE/);
  assert.match(copy, /AUTHENTICATION IS CURRENTLY UNAVAILABLE/);
  assert.match(copy, /PASSWORD SETUP IS CURRENTLY UNAVAILABLE/);
  assert.doesNotMatch(copy, /REQUIRES THE LOCAL DATABASE/);
  assert.doesNotMatch(copy, /CLEANUP PENDING/);
});

test("Dashboard requests use only safe server summaries and stay absent when no action needs attention", async () => {
  const [page, script] = await Promise.all([
    readFile(new URL("../dashboard.html", import.meta.url), "utf8"),
    readFile(new URL("../dashboard-overview.js", import.meta.url), "utf8")
  ]);

  assert.match(page, /id="dashboard-requests-section"/);
  assert.match(page, /id="dashboard-requests-status"[\s\S]*?role="status"/);
  assert.match(page, /dashboard-summary-item dashboard-requests-section/);
  assert.match(page, /<p class="dashboard-label">REQUESTS<\/p>/);
  assert.match(script, /loadDashboardRequests\(presentationRepository\)/);
  assert.match(script, /loadDashboardPublishReadyWorks\(repository\)/);
  assert.match(script, /publishDashboardReadyWork\(repository, request, attempt\.current\(\)\)/);
  assert.match(script, /acknowledgeDashboardPublishReadyWork\(repository, request\)/);
  assert.match(script, /decideDashboardRequest\(/);
  assert.match(script, /request\.kind === "work"/);
  assert.match(script, /request\.kind === "work_ready_to_publish"/);
  assert.match(script, /WORK READY TO PUBLISH — \$\{request\.workTitle\}/);
  assert.match(script, /details\.href = request\.href/);
  assert.match(script, /details\.textContent = "\[ DETAILS \]"/);
  assert.match(script, /createRequestAction\("\[ PUBLISH \]"/);
  assert.match(script, /createRequestAction\("\[ NOT NOW \]"/);
  assert.match(script, /if \(!requestKey \|\| requestActionInFlight\.has\(requestKey\)\) return;/);
  assert.match(script, /setReadyRowBusy\(action, true\);\s*action\.textContent = "\[ PUBLISHING \]"/);
  assert.match(script, /const currentReadyWorks = await loadDashboardPublishReadyWorks\(repository\);[\s\S]*?await loadRequests\(currentReadyWorks\)/);
  assert.match(script, /setRequestsStatus\(dashboardPublishedWorkMessage\(publishedWork, managedProfiles\)\)/);
  assert.match(script, /setRequestsError\(publishedWork[\s\S]*?WORK COULD NOT BE PUBLISHED/);
  assert.doesNotMatch(script, /toast|notificationCount|Notification\(/);
  assert.match(script, /requestActionInFlight/);
  assert.match(script, /function renderRequests\(requests, onDecision, onAcknowledge, hasError = false\)/);
  assert.match(script, /requestsSection\.hidden = requests\.length === 0 && !hasError && requestsStatus\?\.hidden !== false;/);
  assert.match(script, /acknowledgePublishReady,\s*true/);
  assert.doesNotMatch(script, /NO REQUESTS/);
  assert.doesNotMatch(script, /listWorkPresentationRequestSummaries\(/);
  assert.doesNotMatch(script, /get_work_presentation_request_summaries/);
  assert.doesNotMatch(script, /get_work_presentation_requests/);
});

test("Presentation dashboard uses the managed summary feed and marks co-operator context", async () => {
  const script = await readFile(
    new URL("../dashboard-presentations.js", import.meta.url),
    "utf8"
  );

  assert.match(script, /repository\.listPresentations\(\)/);
  assert.match(script, /presentation\.managementRole === "cooperator"/);
  assert.match(script, /CO-OPERATOR/);
  assert.match(script, /presentation\.managementRole === "owner"/);
  assert.doesNotMatch(script, /listPresentations\(profiles\.map/);
});
