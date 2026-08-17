import test from "node:test";
import assert from "node:assert/strict";

import { appendMaterialSuggestion, materialDisplayValues, materialSearchTerms } from "../data/material-terms.mjs";
import { normalizeHttpUrl } from "../data/url-normalization.mjs";

test("HTTP(S) URL normalization accepts human URL input without changing explicit protocols", () => {
  assert.equal(normalizeHttpUrl("example.com"), "https://example.com");
  assert.equal(normalizeHttpUrl("www.example.com"), "https://www.example.com");
  assert.equal(normalizeHttpUrl("https://example.com/path"), "https://example.com/path");
  assert.equal(normalizeHttpUrl("http://example.com"), "http://example.com");
  assert.equal(normalizeHttpUrl("   "), "");
});

test("HTTP(S) URL normalization rejects malformed and unsafe input", () => {
  assert.throws(() => normalizeHttpUrl("not a url"), /VALID HTTP/);
  assert.throws(() => normalizeHttpUrl("javascript:alert(1)"), /VALID HTTP/);
  assert.throws(() => normalizeHttpUrl("https://name:pass@example.com"), /VALID HTTP/);
  assert.throws(() => normalizeHttpUrl("/relative"), /VALID HTTP/);
});

test("material terms normalize comma-separated input while display values retain casing", () => {
  assert.deepEqual(
    materialSearchTerms("Rubber, aluminium, epoxy resin, RUBBER, , "),
    ["rubber", "aluminium", "epoxy resin"]
  );
  assert.deepEqual(
    materialDisplayValues("Rubber, aluminium, epoxy resin, RUBBER, , "),
    ["Rubber", "aluminium", "epoxy resin"]
  );
});

test("material suggestions append only new normalized terms", () => {
  assert.equal(appendMaterialSuggestion("rubber, wood", "RUBBER"), "rubber, wood");
  assert.equal(appendMaterialSuggestion("rubber, wood", "EPOXY RESIN"), "rubber, wood, EPOXY RESIN");
});
