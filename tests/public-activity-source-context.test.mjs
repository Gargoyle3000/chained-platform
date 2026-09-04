import test from "node:test";
import assert from "node:assert/strict";

import {
  createPublicAgendaRepository
} from "../data/public-agenda-repository.mjs";
import {
  createPublicCvRepository
} from "../data/public-cv-repository.mjs";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const ACTIVITY_ID = "22222222-2222-4222-8222-222222222222";
const OCCURRENCE_ID = "33333333-3333-4333-8333-333333333333";
const CATEGORY_ID = "44444444-4444-4444-8444-444444444444";
const ENTRY_ID = "55555555-5555-4555-8555-555555555555";

function publicProfile() {
  return {
    id: PROFILE_ID,
    profile_type: "artist",
    slug: "artist-one",
    display_name: "ARTIST ONE",
    publication_status: "published",
    published_at: "2026-01-01T00:00:00Z",
    show_works: true,
    show_presentations: false,
    show_agenda: true,
    show_cv: true,
    show_press: true
  };
}

function sourceContext() {
  return {
    activity_id: ACTIVITY_ID,
    owner_profile_id: PROFILE_ID,
    title: "HIDDEN PRESENTATION",
    activity_type: "group-exhibition",
    venue_name: "SOURCE VENUE",
    city: "AMSTERDAM",
    country: "NETHERLANDS",
    start_date: "2026-12-01",
    end_date: "2027-01-15",
    external_url: "https://example.test/presentation"
  };
}

test("Agenda resolves a public occurrence through the safe source projection", async () => {
  const requests = [];
  const repository = createPublicAgendaRepository({}, async (_config, resource, query) => {
    requests.push({ resource, query });

    if (resource === "activity_occurrences") {
      return [{
        id: OCCURRENCE_ID,
        owner_profile_id: PROFILE_ID,
        activity_id: ACTIVITY_ID,
        occurrence_type: "opening",
        title_override: null,
        start_date: "2027-01-02",
        end_date: null,
        start_time: null,
        end_time: null,
        time_zone: null,
        venue_name_override: null,
        city_override: null,
        show_in_agenda: true,
        visibility: "published",
        published_at: "2026-12-01T00:00:00Z"
      }];
    }

    if (resource === "rpc/get_public_activity_source_contexts") {
      return [sourceContext()];
    }

    if (resource === "public_profiles") {
      return [publicProfile()];
    }

    throw new Error(`Unexpected public Agenda resource: ${resource}`);
  }, "2026-09-04");

  const items = await repository.listAgenda();

  assert.equal(items.length, 1);
  assert.equal(items[0].title, "HIDDEN PRESENTATION");
  assert.equal(items[0].venueName, "SOURCE VENUE");
  assert.equal(items[0].activity.id, ACTIVITY_ID);
  assert.equal(requests.some(({ resource }) => resource === "profile_activities"), false);

  const projectionRequest = requests.find(
    ({ resource }) => resource === "rpc/get_public_activity_source_contexts"
  );
  assert.equal(projectionRequest.query.get("target_activity_ids"), `{${ACTIVITY_ID}}`);
});

test("automatic CV entries resolve through the safe source projection", async () => {
  const requests = [];
  const repository = createPublicCvRepository({}, async (_config, resource, query) => {
    requests.push({ resource, query });

    if (resource === "public_profiles") return [publicProfile()];
    if (resource === "profile_activities") return [];
    if (resource === "activity_occurrences") return [];
    if (resource === "profile_press_items") return [];
    if (resource === "cv_categories") {
      return [{
        id: CATEGORY_ID,
        profile_id: PROFILE_ID,
        category_type: "exhibition",
        label: "EXHIBITIONS",
        display_order: 0,
        is_visible: true
      }];
    }
    if (resource === "cv_entries") {
      return [{
        id: ENTRY_ID,
        category_id: CATEGORY_ID,
        source_activity_id: ACTIVITY_ID,
        display_order: 0,
        is_visible: true,
        created_at: "2026-01-01T00:00:00Z"
      }];
    }
    if (resource === "rpc/get_public_activity_source_contexts") {
      return [sourceContext()];
    }

    throw new Error(`Unexpected public CV resource: ${resource}`);
  });

  const result = await repository.getProfileCv("artist-one");

  assert.equal(result.kind, "available");
  assert.equal(result.hasPublicPresentations, false);
  assert.equal(result.categories.length, 1);
  assert.deepEqual(result.categories[0].entries[0], {
    id: ENTRY_ID,
    categoryId: CATEGORY_ID,
    yearLabel: "2026–2027",
    line: "HIDDEN PRESENTATION, SOURCE VENUE, AMSTERDAM, NETHERLANDS",
    url: "https://example.test/presentation",
    createdAt: "2026-01-01T00:00:00Z",
    yearScore: 2027
  });

  const sourceRequests = requests.filter(
    ({ resource }) => resource === "rpc/get_public_activity_source_contexts"
  );
  assert.equal(sourceRequests.length, 1);
  assert.equal(sourceRequests[0].query.get("target_activity_ids"), `{${ACTIVITY_ID}}`);
});
