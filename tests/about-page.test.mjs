import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { resolveAboutDestination } from "../about.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("anonymous root is the restrained public CHAINED introduction", async () => {
  const [page, css, script] = await Promise.all([
    read("index.html"),
    read("about.css"),
    read("about.mjs")
  ]);

  assert.doesNotMatch(page, /<header class="site-header" data-public-header>/);
  assert.match(page, /<h1 id="about-title">&lt;CHAINED&gt;<\/h1>/);
  assert.doesNotMatch(page, /class="about-label">ABOUT/);
  assert.match(css, /\.about-intro h1 \{[\s\S]*color: var\(--accent\);/);
  assert.doesNotMatch(css, /\.about-section \{[\s\S]*border-top/);
  assert.match(page, /Digital infrastructure for the professional art practice\./);
  assert.match(page, /<h2 id="about-portfolio">PORTFOLIO<\/h2>/);
  assert.match(page, /<h2 id="about-network">NETWORK<\/h2>/);
  assert.match(page, /<h2 id="about-workspace">WORKSPACE<\/h2>/);
  assert.match(page, /not a social[\s\S]*?media alternative, but a professional tool\./);
  assert.match(page, /href="discover\.html">\[ DISCOVER \]<\/a>/);
  assert.match(page, /href="agenda\.html">\[ AGENDA \]<\/a>/);
  assert.match(page, /href="login\.html">\[ PRIVATE ACCESS \]<\/a>/);
  assert.match(page, /scroll-indicators\.js/);
  assert.match(css, /\.about-summary \{[\s\S]*grid-template-columns: minmax\(0, 820px\) max-content;/);
  assert.match(css, /\.about-section h2 \{[\s\S]*font-weight: 700;/);
  assert.doesNotMatch(page, /pricing|testimonial|funding|alpha/i);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /grid-template-columns: 1fr;/);
  assert.doesNotMatch(css, /box-shadow|gradient|border-radius/);
  assert.match(script, /readApplicationSession/);
  assert.match(script, /applicationSession\?\.kind === "active"/);
  assert.match(script, /window\.location\.replace\(destination\)/);
});

test("Discover retains its canonical anonymous header and legacy About forwards to root", async () => {
  const [discover, about, navigation] = await Promise.all([
    read("discover.html"),
    read("about.html"),
    read("auth/navigation.mjs")
  ]);

  assert.match(discover, /data-anonymous-login href="login\.html">\[ LOG IN \]<\/a>/);
  assert.doesNotMatch(discover, />\[ ABOUT \]</);
  assert.match(about, /http-equiv="refresh" content="0; url=\.\/"/);
  assert.match(navigation, /querySelector\("\[data-anonymous-login\]"\)\?\.remove\(\)/);
});

test("an active application session is redirected to the canonical dashboard", () => {
  assert.equal(resolveAboutDestination({ kind: "active" }), "dashboard.html");
  assert.equal(resolveAboutDestination({ kind: "unauthenticated" }), null);
  assert.equal(resolveAboutDestination({ kind: "denied" }), null);
});
