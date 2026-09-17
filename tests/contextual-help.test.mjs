import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  HELP_CONTEXTS,
  canMountContextualHelp,
  contextualHelpContext,
  contextualHelpKey
} from "../data/contextual-help.mjs";

const routes = Object.freeze({
  "dashboard.html": "dashboard",
  "dashboard-works.html": "works",
  "dashboard-work-edit.html": "work-editor",
  "dashboard-presentations.html": "presentations",
  "dashboard-presentation-edit.html": "presentation-editor",
  "dashboard-agenda.html": "agenda",
  "dashboard-agenda-edit.html": "agenda-editor",
  "dashboard-settings.html": "profile",
  "dashboard-cv.html": "cv",
  "dashboard-press.html": "press",
  "dashboard-portfolio-export.html": "portfolio-export",
  "dashboard-admin-invite.html": "admin",
  "archive.html": "archive",
  "archive-project.html": "project",
  "discover.html": "discover",
  "following.html": "following",
  "profile.html": "public-profile",
  "profile-cv.html": "public-profile",
  "profile-press.html": "public-profile",
  "profile-agenda.html": "public-profile",
  "profile-presentations.html": "public-profile",
  "artwork.html": "public-work",
  "agenda.html": "public-agenda",
  "presentation.html": "public-presentation"
});

test("contextual help resolves every supported authenticated workspace view", () => {
  for (const [route, key] of Object.entries(routes)) {
    assert.equal(contextualHelpKey(`/${route}`), key);
    const context = contextualHelpContext(`/${route}`);
    assert.equal(context, HELP_CONTEXTS[key]);
    assert.equal(context.sections.length, 3);
    assert.deepEqual(context.sections.map(([heading]) => heading), [
      "THIS PAGE",
      "EDIT HERE",
      "CONNECTED TO"
    ]);
  }
  assert.equal(contextualHelpContext("/unknown.html"), null);
});

test("Agenda and Work help preserve the explicit image source-of-truth", () => {
  const work = HELP_CONTEXTS["work-editor"].sections.at(-1)[1];
  const agenda = HELP_CONTEXTS["agenda-editor"].sections.at(-1)[1];
  const presentation = HELP_CONTEXTS["presentation-editor"].sections.at(-1)[1];
  assert.match(work, /explicitly selected through Agenda Edit/);
  assert.match(agenda, /dedicated verified Agenda image/);
  assert.match(agenda, /no first Work is selected automatically/);
  assert.match(presentation, /primarily in Agenda Edit/);
});

test("Selector help explains automatic own Works and private organisation boundaries", () => {
  const copy = HELP_CONTEXTS.archive.sections.map(([, text]) => text).join(" ");
  assert.match(copy, /Selector is your private workspace/);
  assert.match(copy, /PERSONAL shows Works from Artist Profiles you manage, available automatically including drafts/);
  assert.match(copy, /published Works from other artists added with their Work-level \[\+\]/);
  assert.match(copy, /ALL, PERSONAL and SAVED are system filters, not Tags/);
  assert.match(copy, /Tags as private labels for filtering and retrieval/);
  assert.match(copy, /Projects as deliberate ordered selections/);
  assert.match(copy, /CHAINED SELECT PDF/);
  assert.match(copy, /PDF export is not publication/);
  assert.match(copy, /Ordinary Artist Projects stay private and exportable/);
  assert.match(copy, /Curator or Institution Profiles/);
});

test("Project help keeps project membership, PDF output and publication distinct", () => {
  const copy = HELP_CONTEXTS.project.sections.map(([, text]) => text).join(" ");
  assert.match(copy, /Removing a Work from a Project does not delete the Work/);
  assert.match(copy, /Project order controls CHAINED SELECT PDF output/);
  assert.match(copy, /private and never publishes a Work/);
  assert.match(copy, /not CURATED publication/);
});

test("public and network help explains source-of-truth and contextual plus actions", () => {
  const discover = HELP_CONTEXTS.discover.sections.map(([, text]) => text).join(" ");
  const following = HELP_CONTEXTS.following.sections.map(([, text]) => text).join(" ");
  const work = HELP_CONTEXTS["public-work"].sections.map(([, text]) => text).join(" ");
  const agenda = HELP_CONTEXTS["public-agenda"].sections.map(([, text]) => text).join(" ");
  assert.match(discover, /Work-level \[\+\] saves another Artist’s Work privately to Selector/);
  assert.match(discover, /main-navigation \[\+\] is different/);
  assert.match(following, /does not automatically save their Works/);
  assert.match(following, /FOLLOW and Selector are separate private systems/);
  assert.match(work, /Work data is edited in WORKS by its manager/);
  assert.match(agenda, /ALL shows eligible Agenda activity/);
  assert.match(agenda, /FOLLOW limits the view/);
});

test("contextual help is available only to active authenticated sessions", () => {
  const routes = [
    "/discover.html", "/following.html", "/profile.html", "/artwork.html",
    "/agenda.html", "/presentation.html", "/dashboard.html", "/archive.html"
  ];
  for (const route of routes) {
    assert.equal(canMountContextualHelp(route, { authenticated: true }), true);
    assert.equal(canMountContextualHelp(route, { authenticated: false }), false);
  }
  assert.equal(canMountContextualHelp("/unknown.html", { authenticated: true }), false);
});

test("authenticated navigation mounts a fixed help utility outside the header", async () => {
  const [navigation, help, css, dashboard, publicAgenda] = await Promise.all([
    readFile(new URL("../auth/navigation.mjs", import.meta.url), "utf8"),
    readFile(new URL("../data/contextual-help.mjs", import.meta.url), "utf8"),
    readFile(new URL("../auth/auth.css", import.meta.url), "utf8"),
    readFile(new URL("../dashboard.html", import.meta.url), "utf8"),
    readFile(new URL("../agenda.html", import.meta.url), "utf8")
  ]);
  assert.match(navigation, /indicator\.append\(logout\);/);
  assert.match(navigation, /mountContextualHelp\(window\.location\.pathname, \{ authenticated: true \}\);/);
  assert.match(navigation, /try \{\s*mountContextualHelp[\s\S]*?\} catch \{/);
  assert.match(help, /document\.body\.append\(trigger\);/);
  assert.doesNotMatch(help, /indicator\.append\(trigger\);/);
  assert.match(css, /\.contextual-help-trigger \{[\s\S]*?position: fixed;[\s\S]*?bottom: 20px;[\s\S]*?left: var\(--page-gutter\)/);
  assert.match(css, /bottom: calc\(16px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(help, /if \(!canMountContextualHelp\(pathname, \{ authenticated \}\)\) return null;/);
  assert.match(dashboard, /data-auth-protected="true"/);
  assert.doesNotMatch(publicAgenda, /data-auth-protected="true"/);
});

test("contextual help is a user-invoked toggle with outside-click and keyboard dismissal", async () => {
  const source = await readFile(
    new URL("../data/contextual-help.mjs", import.meta.url),
    "utf8"
  );
  assert.match(source, /import \{ calculateAnchoredPopoverPosition \} from "\.\/anchored-popover\.mjs"/);
  assert.match(source, /trigger\.addEventListener\("click"/);
  assert.match(source, /if \(panel\.hidden\) openPanel\(\);[\s\S]*else closePanel\(\);/);
  assert.match(source, /event\.key === "Escape"\) closePanel\(\{ returnFocus: true \}\)/);
  assert.match(source, /panel\.contains\(event\.target\) \|\| trigger\.contains\(event\.target\)/);
  assert.match(source, /window\.addEventListener\("scroll", reposition, true\)/);
  assert.match(source, /window\.removeEventListener\("scroll", reposition, true\)/);
  assert.match(source, /trigger\.focus\(\)/);
  assert.match(source, /panel\.focus\(\)/);
  assert.match(source, /trigger\.type = "button"/);
  assert.doesNotMatch(source, /contextual-help-close|\[ CLOSE \]/);
  assert.doesNotMatch(source, /window\.location\s*=/);
  assert.doesNotMatch(source, /history\./);
  assert.doesNotMatch(source, /form\.reset|FormData|\.value\s*=/);
});

test("contextual help uses one compact anchored popup without changing primary navigation", async () => {
  const [css, navigation] = await Promise.all([
    readFile(new URL("../auth/auth.css", import.meta.url), "utf8"),
    readFile(new URL("../auth/navigation.mjs", import.meta.url), "utf8")
  ]);
  assert.match(css, /\.contextual-help-panel \{[\s\S]*?position: fixed;[\s\S]*?width: min\(360px, calc\(100vw - \(var\(--page-gutter\) \* 2\)\)\);[\s\S]*?max-height: min\(480px/);
  assert.match(css, /@media \(max-width: 720px\) \{[\s\S]*?\.contextual-help-panel \{[\s\S]*?max-height: min\(440px/);
  assert.match(css, /border: var\(--border\)/);
  assert.doesNotMatch(css, /contextual-help[^\n]*box-shadow|contextual-help[^\n]*border-radius/);
  assert.match(navigation, /navigation\.classList\.add\("main-nav-with-dashboard"\)/);
});
