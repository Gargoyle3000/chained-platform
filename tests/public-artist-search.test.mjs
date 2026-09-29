import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import {
  createPublicArtistSearchRepository,
  normalizeArtistSearchQuery,
  PUBLIC_ARTIST_SEARCH_CANDIDATE_LIMIT,
  PUBLIC_ARTIST_SEARCH_LIMIT
} from "../data/public-artist-search-repository.mjs";
import {
  DISCOVER_ARTIST_SEARCH_DEBOUNCE_MS,
  DISCOVER_ARTIST_SUGGESTION_LIMIT,
  mountDiscoverArtistSearch
} from "../discover-artist-search.mjs";

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
  const pageDocument = { handlers: {}, activeElement: null, addEventListener(type, handler) { this.handlers[type] = handler; }, createElement(tag) { return new Element(tag); } };
  class Element {
    constructor(tag = "div") {
      this.tagName = tag;
      this.handlers = {};
      this.attributes = {};
      this.children = [];
      this.hidden = false;
      this.value = "";
      this.textContent = "";
      this.clickCount = 0;
      const classes = new Set();
      this.classList = { toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); }, contains(name) { return classes.has(name); } };
    }
    addEventListener(type, handler) { this.handlers[type] = handler; }
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name]; }
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    contains(target) { for (let current = target; current; current = current.parent) if (current === this) return true; return false; }
    focus() { pageDocument.activeElement = this; }
    click() { this.clickCount += 1; }
    querySelector(selector) { return selector === ".discover-artist-search-trigger" ? trigger : null; }
  }
  const root = new Element();
  const trigger = new Element("button");
  const panel = new Element();
  const input = new Element("input");
  const results = new Element("ul");
  panel.hidden = true;
  results.hidden = true;
  root.append(trigger, panel);
  panel.append(input, results);
  const elements = {
    "discover-artist-search": root,
    "discover-artist-search-panel": panel,
    "discover-artist-search-query": input,
    "discover-artist-search-results": results
  };
  pageDocument.getElementById = (id) => elements[id];
  const pending = new Map();
  let nextTimer = 0;
  const schedule = (callback, delay) => { pending.set(++nextTimer, { callback, delay }); return nextTimer; };
  const cancel = (id) => pending.delete(id);
  const runPending = async () => {
    const jobs = [...pending.values()];
    pending.clear();
    jobs.forEach(({ callback }) => callback());
    await new Promise((resolve) => setImmediate(resolve));
  };
  const fire = (element, type, key) => {
    const event = { target: element, key, prevented: false, preventDefault() { this.prevented = true; } };
    (element.handlers?.[type] || pageDocument.handlers[type])?.(event);
    return event;
  };
  const links = () => results.children.map((item) => item.children[0]);
  return { pageDocument, root, trigger, panel, input, results, pending, schedule, cancel, runPending, fire, links };
}

function mountPage(page, search = async () => []) {
  mountDiscoverArtistSearch({
    pageDocument: page.pageDocument,
    schedule: page.schedule,
    cancel: page.cancel,
    getRepository: async () => ({ runtime: { mode: "supabase" }, repository: { search } })
  });
}

test("Discover places the inline Artist utility above FILTER and removes the standalone route", async () => {
  const [discover, css] = await Promise.all([
    readFile(new URL("../discover.html", import.meta.url), "utf8"),
    readFile(new URL("../styles.css", import.meta.url), "utf8")
  ]);
  assert.ok(discover.indexOf("discover-artist-search-trigger") < discover.indexOf("discover-filter-trigger"));
  assert.match(discover, /<button[^>]+discover-artist-search-trigger[^>]*>\[ FIND ARTISTS \]<\/button>/);
  assert.match(discover, /type="search" minlength="2" maxlength="100"/);
  assert.match(discover, /discover-artist-search\.mjs/);
  assert.doesNotMatch(discover, /artist-search\.html/);
  assert.match(css, /\.discover-artist-search-panel\[hidden\]/);
  await assert.rejects(access(new URL("../artist-search.html", import.meta.url)));
});

test("FIND ARTISTS toggles, focuses input, and closes on Escape or outside click", () => {
  const page = fakePage();
  mountPage(page);
  page.fire(page.trigger, "click");
  assert.equal(page.panel.hidden, false);
  assert.equal(page.trigger.getAttribute("aria-expanded"), "true");
  assert.equal(page.pageDocument.activeElement, page.input);
  page.fire(page.trigger, "click");
  assert.equal(page.panel.hidden, true);
  page.fire(page.trigger, "click");
  assert.equal(page.pageDocument.activeElement, page.input);
  assert.equal(page.fire(page.input, "keydown", "Escape").prevented, true);
  assert.equal(page.panel.hidden, true);
  assert.equal(page.pageDocument.activeElement, page.trigger);
  page.fire(page.trigger, "click");
  page.fire({}, "click");
  assert.equal(page.panel.hidden, true);
});

test("live suggestions debounce, ignore short input and stale results, and cap visible links", async () => {
  const page = fakePage();
  const queries = [];
  let resolveStale;
  mountPage(page, (query) => {
    queries.push(query);
    if (query === "stale") return new Promise((resolve) => { resolveStale = resolve; });
    return Array.from({ length: 12 }, (_, index) => ({ displayName: `Artist ${index}`, slug: `artist-${index}`, href: `profile.html?slug=artist-${index}` }));
  });
  page.fire(page.trigger, "click");
  page.input.value = "a";
  page.fire(page.input, "input");
  assert.equal(page.pending.size, 0);
  assert.equal(page.results.hidden, true);
  page.input.value = "artist";
  page.fire(page.input, "input");
  assert.equal([...page.pending.values()][0].delay, DISCOVER_ARTIST_SEARCH_DEBOUNCE_MS);
  page.input.value = "art";
  page.fire(page.input, "input");
  assert.equal(page.pending.size, 1);
  await page.runPending();
  assert.deepEqual(queries, ["art"]);
  assert.equal(page.links().length, DISCOVER_ARTIST_SUGGESTION_LIMIT);
  assert.equal(page.links()[0].href, "profile.html?slug=artist-0");
  assert.equal(page.links()[0].children[0].textContent, "Artist 0");
  page.input.value = "stale";
  page.fire(page.input, "input");
  await page.runPending();
  page.fire(page.trigger, "click");
  resolveStale([{ displayName: "Stale", slug: "stale", href: "profile.html?slug=stale" }]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(page.panel.hidden, true);
  assert.equal(page.results.hidden, true);
});

test("no matches and request failures use quiet safe states", async () => {
  const page = fakePage();
  mountPage(page, async (query) => {
    if (query === "fail") throw new Error("private backend detail");
    return [];
  });
  page.fire(page.trigger, "click");
  page.input.value = "none";
  page.fire(page.input, "input");
  await page.runPending();
  assert.equal(page.results.children[0].textContent, "NO ARTISTS FOUND");
  page.input.value = "fail";
  page.fire(page.input, "input");
  await page.runPending();
  assert.equal(page.results.children[0].textContent, "ARTIST SEARCH UNAVAILABLE");
});

test("Arrow keys traverse suggestions and Enter follows the selected canonical Profile link", async () => {
  const page = fakePage();
  mountPage(page, async () => [
    { displayName: "First", slug: "first", href: "profile.html?slug=first" },
    { displayName: "Second", slug: "second", href: "profile.html?slug=second" }
  ]);
  page.fire(page.trigger, "click");
  page.input.value = "fi";
  page.fire(page.input, "input");
  await page.runPending();
  const [first, second] = page.links();
  assert.equal(page.fire(page.input, "keydown", "ArrowDown").prevented, true);
  assert.equal(page.pageDocument.activeElement, first);
  page.fire(first, "keydown", "ArrowDown");
  assert.equal(page.pageDocument.activeElement, second);
  page.fire(second, "keydown", "ArrowUp");
  assert.equal(page.pageDocument.activeElement, first);
  assert.equal(page.fire(first, "keydown", "Enter").prevented, true);
  assert.equal(first.clickCount, 1);
  assert.equal(first.href, "profile.html?slug=first");
});
