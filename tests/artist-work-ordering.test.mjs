import test from "node:test";
import assert from "node:assert/strict";

import {
  compareArtistWorkCuration,
  groupArtistWorksByYear,
  moveWorkWithinYear
} from "../data/artist-work-ordering.mjs";

const PROFILE = "11111111-1111-4111-8111-111111111111";

function work(id, yearSort, profileOrder, updatedAt = "2026-09-06T00:00:00Z") {
  return { id, ownerProfileId: PROFILE, yearSort, profileOrder, updatedAt };
}

test("artist curation always keeps known years descending and UNKNOWN last", () => {
  const ordered = [
    work("00000000-0000-4000-8000-000000000003", null, 0),
    work("00000000-0000-4000-8000-000000000002", 2025, 0),
    work("00000000-0000-4000-8000-000000000001", 2026, 0)
  ].sort(compareArtistWorkCuration);
  assert.deepEqual(ordered.map((entry) => entry.yearSort), [2026, 2025, null]);
});

test("manual position controls only the same-year sequence", () => {
  const ordered = [
    work("00000000-0000-4000-8000-000000000001", 2026, 2),
    work("00000000-0000-4000-8000-000000000002", 2026, 0),
    work("00000000-0000-4000-8000-000000000003", 2026, 1)
  ].sort(compareArtistWorkCuration);
  assert.deepEqual(ordered.map((entry) => entry.id), [
    "00000000-0000-4000-8000-000000000002",
    "00000000-0000-4000-8000-000000000003",
    "00000000-0000-4000-8000-000000000001"
  ]);
});

test("malformed or missing positions retain the former updated-time then ID fallback", () => {
  const newer = work("00000000-0000-4000-8000-000000000002", 2026, null, "2026-09-06T01:00:00Z");
  const older = work("00000000-0000-4000-8000-000000000001", 2026, -1, "2026-09-06T00:00:00Z");
  assert.deepEqual([older, newer].sort(compareArtistWorkCuration).map((entry) => entry.id), [newer.id, older.id]);
});

test("Dashboard grouping never offers a cross-year movement target", () => {
  const groups = groupArtistWorksByYear([
    work("00000000-0000-4000-8000-000000000001", 2026, 0),
    work("00000000-0000-4000-8000-000000000002", 2025, 0)
  ], new Map([[PROFILE, "ARTIST"]]));
  assert.equal(groups.length, 2);
  assert.equal(moveWorkWithinYear(groups[0].works, groups[0].works[0].id, 1), null);
});

test("same-year keyboard movement swaps only adjacent curated Works", () => {
  const works = [
    work("00000000-0000-4000-8000-000000000001", 2026, 0),
    work("00000000-0000-4000-8000-000000000002", 2026, 1)
  ];
  assert.deepEqual(
    moveWorkWithinYear(works, works[1].id, -1).map((entry) => entry.id),
    [works[1].id, works[0].id]
  );
});
