import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("authenticated navigation materializes only from the explicit Discover template", async () => {
  const source = await readFile(new URL("../auth/navigation.mjs", import.meta.url), "utf8");
  assert.match(source, /template\[data-authenticated-navigation\]/);
  assert.match(source, /data-anonymous-login/);
  assert.match(source, /template\.remove\(\)/);
  assert.match(source, /ensureSessionIndicator\(actions, client\)/);
});

test("public action slots use the shared right-side header position", async () => {
  const discover = await readFile(new URL("../discover.html", import.meta.url), "utf8");
  const login = await readFile(new URL("../login.html", import.meta.url), "utf8");

  assert.match(discover, /auth-session-indicator public-action-slot[\s\S]*data-anonymous-login[^>]+href="login\.html"[^>]*>\[ LOG IN \]/);
  assert.match(login, /auth-session-indicator public-action-slot[\s\S]*href="discover\.html"[^>]*>\[ DISCOVER \]/);
  assert.doesNotMatch(login, /<nav[^>]*>[\s\S]*>DISCOVER<\/a>[\s\S]*<\/nav>/);
});

test("interactive Dashboard links show [+] on public and management headers", async () => {
  const pages = [
    "agenda.html", "archive-project.html", "archive.html", "discover.html", "following.html",
    "dashboard.html", "dashboard-admin-invite.html", "dashboard-agenda-edit.html",
    "dashboard-agenda.html", "dashboard-cv.html", "dashboard-portfolio-export.html",
    "dashboard-presentation-edit.html", "dashboard-presentations.html", "dashboard-press.html",
    "dashboard-settings.html", "dashboard-work-edit.html", "dashboard-works.html"
  ];
  const dashboardAction = /<a\b(?=[^>]*class="dashboard-link(?: is-active)?")(?=[^>]*href="dashboard\.html")(?=[^>]*aria-label="Open dashboard")[^>]*>\s*\[\+\]\s*<\/a>/;
  for (const page of pages) {
    const markup = await readFile(new URL(`../${page}`, import.meta.url), "utf8");
    assert.match(markup, dashboardAction, page);
    if (page.startsWith("dashboard-") || page === "dashboard.html") {
      assert.match(markup, /class="dashboard-page-marker" aria-hidden="true">\+<\/div>/, page);
    }
  }
  const source = await readFile(new URL("../auth/navigation.mjs", import.meta.url), "utf8");
  assert.match(source, /dashboardLink\.textContent = "\[\+\]"/);
});
