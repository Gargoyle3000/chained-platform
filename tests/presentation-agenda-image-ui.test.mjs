import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Presentation editor keeps one dedicated Agenda image and explicit representative Work controls", async () => {
  const [page, form, repository, controller] = await Promise.all([
    readFile(new URL("../dashboard-presentation-edit.html", import.meta.url), "utf8"),
    readFile(new URL("../dashboard-presentation-form.js", import.meta.url), "utf8"),
    readFile(new URL("../data/presentation-repository.mjs", import.meta.url), "utf8"),
    readFile(new URL("../data/presentation-agenda-image-ui.mjs", import.meta.url), "utf8")
  ]);
  assert.match(page, /AGENDA IMAGE/);
  assert.match(page, /REPRESENTATIVE WORK/);
  assert.match(page, /presentation-agenda-image-input/);
  assert.match(form, /createPresentationAgendaImageController/);
  assert.match(repository, /presentation-agenda-image-service/);
  assert.match(controller, /VERIFYING AGENDA IMAGE/);
  assert.match(controller, /context\?\.hasDedicatedImage/);
});

test("Agenda editor exposes the same image controls only for a saved linked Presentation", async () => {
  const [page, form, repository, controller, css] = await Promise.all([
    readFile(new URL("../dashboard-agenda-edit.html", import.meta.url), "utf8"),
    readFile(new URL("../dashboard-agenda-form.js", import.meta.url), "utf8"),
    readFile(new URL("../data/agenda-repository.mjs", import.meta.url), "utf8"),
    readFile(new URL("../data/presentation-agenda-image-ui.mjs", import.meta.url), "utf8"),
    readFile(new URL("../presentation-agenda-image.css", import.meta.url), "utf8")
  ]);
  assert.match(page, /agenda-presentation-image-section/);
  assert.match(page, /AGENDA IMAGE/);
  assert.match(page, /REPRESENTATIVE WORK/);
  assert.match(form, /currentAgendaItemId/);
  assert.match(form, /currentPresentationId/);
  assert.match(form, /refreshAgendaImageControls/);
  assert.match(repository, /presentation-agenda-image-service/);
  assert.match(controller, /section\.hidden = true/);
  assert.match(page, /presentation-agenda-image\.css/);
  assert.match(css, /minmax\(0, 420px\) max-content/);
  assert.match(css, /@media \(max-width: 700px\)/);
});

test("Agenda items render a compact optional image without a placeholder", async () => {
  const [script, css] = await Promise.all([
    readFile(new URL("../agenda.js", import.meta.url), "utf8"),
    readFile(new URL("../agenda.css", import.meta.url), "utf8")
  ]);
  assert.match(script, /item\.thumbnail\?\.src/);
  assert.match(script, /agenda-event-thumbnail/);
  assert.match(css, /\.agenda-event-thumbnail/);
  assert.match(css, /object-fit: contain/);
});
