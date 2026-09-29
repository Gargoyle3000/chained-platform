import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createPublicArtistSearchRepository,
  normalizeArtistSearchQuery,
  PUBLIC_ARTIST_SEARCH_CANDIDATE_LIMIT,
  PUBLIC_ARTIST_SEARCH_LIMIT
} from "../data/public-artist-search-repository.mjs";
import { mountArtistSearch } from "../artist-search.mjs";

const config = { supabaseUrl: "https://example.invalid", supabaseKey: "public-test-key" };

test("search matches display names and slugs case-insensitively with exact, prefix, then substring ordering", async () => {
  const calls = [];
  const rows = {
    display_name: [
      { display_name: "Alina Stone", slug: "alina-stone" },
      { display_name: "Valerie", slug: "valerie" },
      { display_name: "ALi", slug: "artist-alias" },
      { display_name: "Alicia", slug: "alicia" }
    ],
    slug: [
      { display_name: "Other Artist", slug: "ali" },
      { display_name: "Alina Stone", slug: "alina-stone" }
    ]
  };
  const repository = createPublicArtistSearchRepository(config, async (receivedConfig, table, parameters) => {
    calls.push({ receivedConfig, table, parameters });
    return rows[parameters.has("display_name") ? "display_name" : "slug"];
  });
  const results = await repository.search("  aLi  ");
  assert.deepEqual(results.map(({ displayName, slug }) => [displayName, slug]), [
    ["ALi", "artist-alias"],
    ["Other Artist", "ali"],
    ["Alicia", "alicia"],
    ["Alina Stone", "alina-stone"],
    ["Valerie", "valerie"]
  ]);
  assert.deepEqual(results[0], { displayName: "ALi", slug: "artist-alias", href: "profile.html?slug=artist-alias" });
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.receivedConfig, config);
    assert.equal(call.table, "public_profiles");
    assert.equal(call.parameters.get("display_name") || call.parameters.get("slug"), "ilike.*aLi*");
    assert.equal(call.parameters.get("profile_type"), "eq.artist");
    assert.equal(call.parameters.get("claim_state"), "eq.claimed");
    assert.equal(call.parameters.get("publication_status"), "eq.published");
    assert.equal(call.parameters.get("select"), "slug,display_name");
    assert.equal(call.parameters.get("order"), "display_name.asc,slug.asc");
    assert.equal(call.parameters.get("limit"), String(PUBLIC_ARTIST_SEARCH_CANDIDATE_LIMIT));
    assert.equal(call.parameters.has("account_id"), false);
  }
  assert.equal(normalizeArtistSearchQuery("  A   Li "), "A Li");
});

test("empty and one-character input issue no query; LIKE metacharacters are literal", async () => {
  let requests = 0;
  const repository = createPublicArtistSearchRepository(config, async (_config, _table, parameters) => {
    requests += 1;
    assert.equal(parameters.get("display_name") || parameters.get("slug"), "ilike.*a\\%\\_\\**");
    return [];
  });
  assert.deepEqual(await repository.search("  "), []);
  assert.deepEqual(await repository.search(" a "), []);
  assert.equal(requests, 0);
  assert.deepEqual(await repository.search("a%_*"), []);
  assert.equal(requests, 2);
});

test("candidate and visible result counts are bounded and invalid slugs are discarded", async () => {
  const many = Array.from({ length: 60 }, (_, index) => ({
    display_name: `Artist ${String(index).padStart(2, "0")}`,
    slug: `artist-${String(index).padStart(2, "2")}`
  }));
  many.push({ display_name: "Invalid", slug: "Not A Slug" });
  const repository = createPublicArtistSearchRepository(config, async () => many);
  const results = await repository.search("artist");
  assert.equal(results.length, PUBLIC_ARTIST_SEARCH_LIMIT);
  assert.ok(results.every((result) => result.href === `profile.html?slug=${result.slug}`));
});

test("query failure propagates for the page to show its safe error state", async () => {
  const repository = createPublicArtistSearchRepository(config, async () => { throw new Error("private backend detail"); });
  await assert.rejects(repository.search("artist"));
});

function fakePage() {
  const form = { attributes: {}, handlers: {}, addEventListener(type, handler) { this.handlers[type] = handler; }, setAttribute(name, value) { this.attributes[name] = value; }, removeAttribute(name) { delete this.attributes[name]; } };
  const input = { value: "" };
  const status = { textContent: "" };
  const results = { children: [], replaceChildren(...children) { this.children = children; } };
  const pageDocument = {
    getElementById(id) { return ({ "artist-search-form": form, "artist-search-query": input, "artist-search-status": status, "artist-search-results": results })[id]; },
    createElement(tagName) {
      return { tagName, children: [], append(...children) { this.children.push(...children); } };
    }
  };
  return { form, input, status, results, pageDocument };
}

test("page submission is explicit, handles empty/no-result/error states and renders canonical keyboard links", async () => {
  const page = fakePage();
  let queries = 0;
  mountArtistSearch({ pageDocument: page.pageDocument, getRepository: async () => ({
    runtime: { mode: "supabase" },
    repository: { async search(query) {
      queries += 1;
      if (query === "none") return [];
      if (query === "fail") throw new Error("private backend detail");
      return [{ displayName: "Artist Name", slug: "artist-name", href: "profile.html?slug=artist-name" }];
    } }
  }) });
  let prevented = false;
  await page.form.handlers.submit({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(queries, 0);
  page.input.value = "Name";
  await page.form.handlers.submit({ preventDefault() {} });
  assert.equal(page.status.textContent, "1 ARTIST FOUND.");
  assert.equal(page.results.children[0].children[0].href, "profile.html?slug=artist-name");
  page.input.value = "none";
  await page.form.handlers.submit({ preventDefault() {} });
  assert.equal(page.status.textContent, "NO ARTIST PROFILES FOUND.");
  page.input.value = "fail";
  await page.form.handlers.submit({ preventDefault() {} });
  assert.equal(page.status.textContent, "ARTIST SEARCH IS CURRENTLY UNAVAILABLE. TRY AGAIN.");
  assert.equal(page.form.attributes["aria-busy"], undefined);
});

test("Artist search route is linked from Discover and exposes only the public-search contract", async () => {
  const [page, discover, css] = await Promise.all([
    readFile(new URL("../artist-search.html", import.meta.url), "utf8"),
    readFile(new URL("../discover.html", import.meta.url), "utf8"),
    readFile(new URL("../artist-search.css", import.meta.url), "utf8")
  ]);
  assert.match(discover, /href="artist-search\.html">\[ FIND ARTISTS \]/);
  assert.match(page, /<form[^>]+role="search"/);
  assert.match(page, /type="search" minlength="2" maxlength="100"/);
  assert.match(page, /aria-live="polite"/);
  assert.match(page, /auth\/public-navigation\.mjs/);
  assert.match(css, /@media \(max-width: 500px\)/);
  assert.match(css, /overflow-wrap: anywhere/);
});
