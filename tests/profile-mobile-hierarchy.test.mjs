import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("mobile Profile keeps its local navigation vertical with separated identity and follow groups", async () => {
  const profileCss = await source("../profile.css");
  const mobile = profileCss.match(/@media \(max-width: 700px\) \{[\s\S]*$/)?.[0] || "";

  assert.match(mobile, /\.artist-intro h1 \{[\s\S]*?margin-bottom: 10px;/);
  assert.match(mobile, /\.profile-follow \{[\s\S]*?margin-top: 14px;[\s\S]*?margin-bottom: 18px;/);
  assert.match(mobile, /\.artist-navigation \{[\s\S]*?flex-direction: column;[\s\S]*?gap: 6px;/);
  assert.doesNotMatch(mobile, /\.artist-navigation \{[\s\S]*?flex-direction: row;/);
  assert.match(mobile, /\.artist-profile-links \{[\s\S]*?margin: 32px 0 var\(--mobile-profile-links-to-work\);/);
});

test("Profile keeps all local section routes and the existing active Works state", async () => {
  const [html, script] = await Promise.all([
    source("../profile.html"),
    source("../profile-dynamic.js")
  ]);

  assert.match(html, /<nav class="artist-navigation" aria-label="Artist profile">/);
  assert.match(html, /id="profile-works-link" href="#works">WORKS/);
  assert.match(html, /id="profile-presentations-link"[\s\S]*?href="profile-presentations\.html"[\s\S]*?PRESENTATIONS/);
  assert.match(html, /id="profile-agenda-link"[\s\S]*?href="profile-agenda\.html"[\s\S]*?AGENDA/);
  assert.match(html, /id="profile-cv-link"[\s\S]*?href="profile-cv\.html"[\s\S]*?CV/);
  assert.match(script, /worksLink\.href = profileHref;/);
  assert.match(script, /presentationsLink\.href =[\s\S]*?profile-presentations\.html\?slug=/);
  assert.match(script, /agendaLink\.href =[\s\S]*?profile-agenda\.html\?slug=/);
  assert.match(script, /cvLink\.href =[\s\S]*?profile-cv\.html\?slug=/);
});
