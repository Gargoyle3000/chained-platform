import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Agenda uses semantic canonical Presentation links and keeps external links separate", async () => {
  const [script, css] = await Promise.all([
    readFile(new URL("../agenda.js", import.meta.url), "utf8"),
    readFile(new URL("../agenda.css", import.meta.url), "utf8")
  ]);

  assert.match(script, /if \(item\.presentationHref\)/);
  assert.match(script, /presentation\.className\s*=\s*\n?\s*"agenda-presentation-link"/);
  assert.match(script, /presentation\.href\s*=\s*item\.presentationHref/);
  assert.match(script, /external\.className\s*=\s*"agenda-external"/);
  assert.match(script, /external\.rel\s*=\s*"noopener noreferrer"/);
  assert.match(css, /\.agenda-event-main \.agenda-presentation-link/);
  assert.match(css, /\.agenda-presentation-link:focus-visible/);
});
