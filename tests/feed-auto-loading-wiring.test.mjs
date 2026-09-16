import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Discover and Follow share the auto-feed loader while retaining their existing feed contracts", async () => {
  const [discover, following] = await Promise.all([
    readFile(new URL("../discover.js", import.meta.url), "utf8"),
    readFile(new URL("../following.js", import.meta.url), "utf8")
  ]);

  for (const source of [discover, following]) {
    assert.match(source, /import\("\.\/data\/auto-feed-loader\.mjs"\)/);
    assert.match(source, /createAutoFeedLoader\(/);
    assert.match(source, /discover-feed-sentinel/);
    assert.match(source, /createArchiveAction\(work, archiveState, announceArchiveStatus, "discover-archive-action"\)/);
  }
  assert.match(discover, /requestGate\.isCurrent\(version\)/);
  assert.match(following, /repository\.loadFollowingFeed\(cursor\)/);
  assert.match(following, /window\.addEventListener\("pagehide"/);
});
