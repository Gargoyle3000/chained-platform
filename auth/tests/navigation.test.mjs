import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveOwnProfileNavigation
} from "../navigation.mjs";

test("one published managed profile links to its dynamic public profile", () => {
  const result = resolveOwnProfileNavigation([
    {
      id: "profile-1",
      slug: "local-workspace-artist",
      publication_status: "published"
    }
  ]);

  assert.equal(result.kind, "profile");
  assert.equal(
    result.href,
    "profile.html?slug=local-workspace-artist"
  );
  assert.equal(result.profile.id, "profile-1");
});

test("no managed profiles falls back safely to the dashboard", () => {
  const result = resolveOwnProfileNavigation([]);

  assert.equal(result.kind, "none");
  assert.equal(result.href, "dashboard.html");
  assert.equal(result.profile, null);
});

test("multiple managed profiles do not silently select one", () => {
  const result = resolveOwnProfileNavigation([
    {
      id: "profile-1",
      slug: "artist-one",
      publication_status: "published"
    },
    {
      id: "profile-2",
      slug: "artist-two",
      publication_status: "published"
    }
  ]);

  assert.equal(result.kind, "multiple");
  assert.equal(result.href, "dashboard.html");
  assert.equal(result.profile, null);
});

test("one unpublished managed profile falls back to the dashboard", () => {
  const result = resolveOwnProfileNavigation([
    {
      id: "profile-1",
      slug: "draft-artist",
      publication_status: "draft"
    }
  ]);

  assert.equal(result.kind, "one");
  assert.equal(result.href, "dashboard.html");
  assert.equal(result.profile, null);
});
