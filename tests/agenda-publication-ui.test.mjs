import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Agenda editor retains the draft-first state machine and exposes its explicit publish transition", async () => {
  const [page, script, repository] = await Promise.all([
    readFile(new URL("../dashboard-agenda-edit.html", import.meta.url), "utf8"),
    readFile(new URL("../dashboard-agenda-form.js", import.meta.url), "utf8"),
    readFile(new URL("../data/agenda-repository.mjs", import.meta.url), "utf8")
  ]);

  assert.match(page, /id="agenda-publication"[\s\S]*type="button"/);
  assert.match(page, /\[ PUBLISH \]/);
  assert.match(script, /publicationButton\.textContent = published[\s\S]*\[ UNPUBLISH \][\s\S]*\[ PUBLISH \]/);
  assert.match(script, /await saveAgendaItem\(\{ publish: true \}\)/);
  assert.match(script, /saved = await repository\.publishAgendaItem\([\s\S]*saved\.id,[\s\S]*saved\.updatedAt/);
  assert.match(script, /await repository\.unpublishAgendaItem\(/);
  assert.match(repository, /\.update\(\{ visibility: "published" \}\)/);
  assert.match(repository, /\.update\(\{ visibility: "draft" \}\)/);
});

test("Presentation Program saves omit the independent Agenda visibility flag", async () => {
  const repository = await readFile(
    new URL("../data/presentation-repository.mjs", import.meta.url),
    "utf8"
  );
  const mapper = repository.match(
    /function presentationProgramToDatabase\(record\) \{([\s\S]*?)\n\}/
  )?.[1];

  assert.ok(mapper);
  assert.doesNotMatch(mapper, /show_in_agenda/);
  assert.match(repository, /set_presentation_occurrence_visibility/);
});
