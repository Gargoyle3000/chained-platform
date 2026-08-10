import test from "node:test";
import assert from "node:assert/strict";
import {
  archiveProjectLocation,
  filterArchiveProjectWorks,
  orderedProjectWorks,
  resolveArchiveProjectId
} from "../data/archive-project-state.mjs";

const works = [
  { id: "work-a", title: "ALPHA", artistName: "ARTIST", yearLabel: "2026", workType: "single-work" },
  { id: "work-b", title: "BETA", artistName: "ARTIST", yearLabel: "2025", workType: "single-work" },
  { id: "work-c", title: "GAMMA", artistName: "OTHER", yearLabel: "2024", workType: "single-work" }
];

const items = [
  { projectId: "project-a", workId: "work-b", position: 1 },
  { projectId: "project-a", workId: "work-a", position: 0 },
  { projectId: "project-b", workId: "work-a", position: 0 }
];

test("active Archive Project uses persisted membership order without changing membership", () => {
  assert.deepEqual(orderedProjectWorks(works, items, "project-a").map((work) => work.id), ["work-a", "work-b"]);
  assert.deepEqual(orderedProjectWorks(works, items, null).map((work) => work.id), ["work-a", "work-b", "work-c"]);
  assert.equal(items.length, 3);
});

test("Archive search and tags only narrow the active Project sequence", () => {
  const projectWorks = orderedProjectWorks(works, items, "project-a");
  const tags = new Map([["work-a", new Set(["tag-a"])], ["work-b", new Set(["tag-a", "tag-b"])] ]);
  assert.deepEqual(filterArchiveProjectWorks(projectWorks, "", new Set(["tag-a"]), (id) => tags.get(id) || new Set()).map((work) => work.id), ["work-a", "work-b"]);
  assert.deepEqual(filterArchiveProjectWorks(projectWorks, "beta", new Set(["tag-a"]), (id) => tags.get(id) || new Set()).map((work) => work.id), ["work-b"]);
  assert.equal(items[0].position, 1);
});

test("Archive Project URL state accepts only a current owned Project", () => {
  const projects = [{ id: "11111111-1111-4111-8111-111111111111" }];
  assert.equal(
    resolveArchiveProjectId("?project=11111111-1111-4111-8111-111111111111", projects),
    "11111111-1111-4111-8111-111111111111"
  );
  assert.equal(
    resolveArchiveProjectId("?project=22222222-2222-4222-8222-222222222222", projects),
    null
  );
  assert.equal(resolveArchiveProjectId("?project=not-a-project", projects), null);
  assert.equal(resolveArchiveProjectId("?project=11111111-1111-4111-8111-111111111111&project=11111111-1111-4111-8111-111111111111", projects), null);
});

test("Archive Project URL state preserves unrelated parameters and clears only Project", () => {
  const projectId = "11111111-1111-4111-8111-111111111111";
  const selected = archiveProjectLocation("https://chained.test/archive.html?view=grid#works", projectId);
  assert.equal(selected, `/archive.html?view=grid&project=${projectId}#works`);
  assert.equal(archiveProjectLocation(`https://chained.test${selected}`, null), "/archive.html?view=grid#works");
});
