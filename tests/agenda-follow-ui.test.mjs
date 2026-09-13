import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  createFollowedAgendaRepository
} from "../data/public-agenda-repository.mjs";

const PROFILE_ID = "71111111-1111-4111-8111-111111111111";
const ACTIVITY_ID = "72222222-2222-4222-8222-222222222222";
const OCCURRENCE_ID = "73333333-3333-4333-8333-333333333333";

test("FOLLOW uses one self-scoped Agenda RPC and accepts only its minimal public projection", async () => {
  const calls = [];
  const repository = createFollowedAgendaRepository({
    supabaseUrl: "https://project.supabase.co",
    async rpc(name) {
      calls.push(name);

      return {
        data: [{
          occurrence_id: OCCURRENCE_ID,
          owner_profile_id: PROFILE_ID,
          activity_id: ACTIVITY_ID,
          occurrence_type: "opening",
          title: "FOLLOWED OPENING",
          start_date: "2027-01-02",
          end_date: null,
          start_time: "18:00:00",
          end_time: null,
          time_zone: "Europe/Amsterdam",
          venue_name: "VENUE",
          city: "AMSTERDAM",
          country: "NETHERLANDS",
          external_url: "https://example.test/presentation",
          artist_slug: "followed-artist",
          artist_display_name: "FOLLOWED ARTIST",
          presentation_id: ACTIVITY_ID,
          thumbnail_kind: "dedicated",
          dedicated_image_id: "74444444-4444-4444-8444-444444444444",
          dedicated_updated_at: "2026-09-13T12:00:00Z"
        }],
        error: null
      };
    }
  }, "2026-09-13");

  const items = await repository.listAgenda();

  assert.deepEqual(calls, ["list_followed_agenda"]);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, OCCURRENCE_ID);
  assert.equal(items[0].artist.slug, "followed-artist");
  assert.equal(items[0].presentationHref, `presentation.html?id=${ACTIVITY_ID}`);
  assert.equal(items[0].thumbnail?.kind, "dedicated");
  assert.match(items[0].thumbnail?.src || "", /public-presentation-agenda-image\?presentation_id=/);
  assert.equal(items[0].accountId, undefined);
  assert.equal(items[0].privateObjectPath, undefined);
});

test("Agenda thumbnail contract is one public projection and never exposes private paths", async () => {
  const source = await readFile(new URL("../data/public-agenda-repository.mjs", import.meta.url), "utf8");
  assert.match(source, /rpc\/get_public_agenda_thumbnail_contexts/);
  assert.match(source, /public-presentation-agenda-image/);
  assert.match(source, /work_public_object_path/);
  assert.doesNotMatch(source, /preview_object_path/);
  assert.doesNotMatch(source, /private_object_path/);
});

test("FOLLOW drops stale or malformed rows returned by the server", async () => {
  const repository = createFollowedAgendaRepository({
    supabaseUrl: "https://project.supabase.co",
    async rpc() {
      return {
        data: [{
          occurrence_id: OCCURRENCE_ID,
          owner_profile_id: PROFILE_ID,
          occurrence_type: "opening",
          title: "PAST",
          start_date: "2026-01-01",
          artist_slug: "followed-artist",
          artist_display_name: "FOLLOWED ARTIST"
        }, {
          occurrence_id: "not-a-uuid",
          owner_profile_id: PROFILE_ID,
          occurrence_type: "opening",
          title: "INVALID",
          start_date: "2027-01-02",
          artist_slug: "followed-artist",
          artist_display_name: "FOLLOWED ARTIST"
        }],
        error: null
      };
    }
  }, "2026-09-13");

  assert.deepEqual(await repository.listAgenda(), []);
});

test("Agenda keeps ALL public, protects FOLLOW through login, and retains URL state", async () => {
  const [page, script, css] = await Promise.all([
    readFile(new URL("../agenda.html", import.meta.url), "utf8"),
    readFile(new URL("../agenda.js", import.meta.url), "utf8"),
    readFile(new URL("../agenda.css", import.meta.url), "utf8")
  ]);

  assert.match(page, /data-public-header/);
  assert.match(page, /data-agenda-view="all"[\s\S]*?\[ ALL \]/);
  assert.match(page, /data-agenda-view="follow"[\s\S]*?\[ FOLLOW \]/);
  assert.match(page, /data-agenda-view="follow"[\s\S]*?<\/button>[\s\S]*?<section[\s\S]*?id="agenda-city-section"/);
  assert.doesNotMatch(page, /auth\/guard\.mjs/);
  assert.match(script, /params\.get\("view"\) === VIEW_FOLLOW/);
  assert.match(script, /url\.searchParams\.append\("city", city\)/);
  assert.match(script, /sendAnonymousFollowToLogin/);
  assert.match(script, /NO CURRENT OR UPCOMING EVENTS FROM FOLLOWED PROFILES/);
  assert.match(script, /window\.addEventListener\("popstate"/);
  assert.match(css, /\.agenda-view-switch/);
  assert.doesNotMatch(css, /\.agenda-view-switch[\s\S]*border-top/);
});
