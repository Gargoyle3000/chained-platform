import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  createPublicPresentationRepository
} from "../data/public-presentation-repository.mjs";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const PRESENTATION_ID = "22222222-2222-4222-8222-222222222222";

function profile(overrides = {}) {
  return {
    id: PROFILE_ID,
    profile_type: "artist",
    slug: "artist-one",
    display_name: "ARTIST ONE",
    publication_status: "published",
    published_at: "2026-09-01T00:00:00Z",
    show_presentations: true,
    ...overrides
  };
}

function presentation(overrides = {}) {
  return {
    id: PRESENTATION_ID,
    owner_profile_id: PROFILE_ID,
    title: "GOTHIC SUMMER",
    activity_type: "group-exhibition",
    venue_name: "KUNSTHAL",
    city: "ROTTERDAM",
    country: "NL",
    start_date: "2026-06-01",
    end_date: "2026-08-01",
    description: "PUBLIC DESCRIPTION",
    external_url: "https://example.test/presentation",
    show_in_presentations: true,
    visibility: "published",
    published_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    ...overrides
  };
}

test("a valid public Presentation resolves by its canonical ID route", async () => {
  const requests = [];
  const repository = createPublicPresentationRepository({}, async (_config, table, query) => {
    requests.push({ table, query });
    return table === "profile_activities" ? [presentation()] : [profile()];
  });

  const result = await repository.getPresentation(PRESENTATION_ID);

  assert.equal(result.kind, "available");
  assert.equal(result.presentation.id, PRESENTATION_ID);
  assert.equal(result.presentation.title, "GOTHIC SUMMER");
  assert.equal(result.profile.slug, "artist-one");
  assert.equal(requests[0].table, "profile_activities");
  assert.equal(requests[0].query.get("id"), `eq.${PRESENTATION_ID}`);
  assert.equal(requests[0].query.get("visibility"), "eq.published");
  assert.equal(requests[0].query.get("show_in_presentations"), "eq.true");
  assert.equal(requests[1].table, "public_profiles");
  assert.equal(requests[1].query.get("id"), `eq.${PROFILE_ID}`);
});

test("public Presentation context uses narrow projections without linked profile identifiers", async () => {
  const repository = createPublicPresentationRepository({}, async (_config, table) => {
    if (table === "profile_activities") return [presentation()];
    if (table === "public_profiles") return [profile()];
    if (table === "rpc/get_public_presentation_participant_summaries") return [{ display_name: "HISTORICAL ARTIST", linked_profile_slug: "artist-one" }];
    if (table === "rpc/get_public_presentation_program") return [{ title: "OPENING", occurrence_type: "opening", start_date: "2026-06-01" }];
    if (table === "rpc/get_public_presentation_works") return [{ work_id: "33333333-3333-4333-8333-333333333333", title: "PUBLIC WORK", artist_slug: "artist-one", artist_display_name: "ARTIST ONE", public_object_path: "public.webp" }];
    return [];
  }, { storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "https://example.test/public.webp" } }) }) } });
  const result = await repository.getPresentation(PRESENTATION_ID);
  assert.deepEqual(result.participants, [{ displayName: "HISTORICAL ARTIST", profileSlug: "artist-one" }]);
  assert.equal(result.program[0].title, "OPENING");
  assert.equal(result.works[0].artworkHref, "artwork.html?id=33333333-3333-4333-8333-333333333333");
  assert.equal(JSON.stringify(result.participants).includes("linked_profile_id"), false);
});

test("missing, invalid, and non-public Presentations share the unavailable result", async () => {
  let calls = 0;
  const missing = createPublicPresentationRepository({}, async () => {
    calls += 1;
    return [];
  });
  assert.deepEqual(await missing.getPresentation(PRESENTATION_ID), { kind: "unavailable" });
  assert.deepEqual(await missing.getPresentation("not-an-id"), { kind: "unavailable" });
  assert.equal(calls, 1);

  const privatePresentation = createPublicPresentationRepository({}, async (_config, table) => (
    table === "profile_activities"
      ? [presentation({ visibility: "draft", published_at: null })]
      : [profile()]
  ));
  const result = await privatePresentation.getPresentation(PRESENTATION_ID);
  assert.deepEqual(result, { kind: "unavailable" });
  assert.equal(JSON.stringify(result).includes("GOTHIC SUMMER"), false);
});

test("a public Presentation remains unavailable when its artist hides Presentations", async () => {
  const repository = createPublicPresentationRepository({}, async (_config, table) => (
    table === "profile_activities" ? [presentation()] : [profile({ show_presentations: false })]
  ));
  assert.deepEqual(await repository.getPresentation(PRESENTATION_ID), { kind: "unavailable" });
});

test("a Presentation never becomes public through an unpublished artist profile", async () => {
  const repository = createPublicPresentationRepository({}, async (_config, table) => (
    table === "profile_activities"
      ? [presentation()]
      : [profile({ publication_status: "draft", published_at: null })]
  ));
  assert.deepEqual(await repository.getPresentation(PRESENTATION_ID), { kind: "unavailable" });
});

test("the detail page is a direct canonical deep-link route", async () => {
  const [page, script] = await Promise.all([
    readFile(new URL("../presentation.html", import.meta.url), "utf8"),
    readFile(new URL("../presentation.js", import.meta.url), "utf8")
  ]);
  assert.match(page, /src="presentation\.js"/);
  assert.match(script, /search\)\.get\("id"\)/);
  assert.match(script, /repository\.getPresentation\(id\)/);
});
