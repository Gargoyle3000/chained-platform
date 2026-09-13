import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Presentation editor keeps one dedicated Agenda image and explicit representative Work controls", async () => {
  const [page, form, repository] = await Promise.all([
    readFile(new URL("../dashboard-presentation-edit.html", import.meta.url), "utf8"),
    readFile(new URL("../dashboard-presentation-form.js", import.meta.url), "utf8"),
    readFile(new URL("../data/presentation-repository.mjs", import.meta.url), "utf8")
  ]);
  assert.match(page, /AGENDA IMAGE/);
  assert.match(page, /REPRESENTATIVE WORK/);
  assert.match(page, /presentation-agenda-image-input/);
  assert.match(form, /uploadPresentationAgendaImage/);
  assert.match(form, /setPresentationRepresentativeWork/);
  assert.match(repository, /reserve_presentation_agenda_image_upload/);
  assert.match(repository, /finalize-presentation-agenda-image/);
  assert.match(repository, /delete-presentation-agenda-image/);
  assert.match(repository, /createPrivateImagePreview/);
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
