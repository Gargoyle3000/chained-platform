import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
