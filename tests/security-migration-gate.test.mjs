import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  detectSecuritySensitiveSql,
  determineChangedFiles,
  evaluateSecurityMigrationGate,
  formatGateFailure,
  normalizeRepositoryPath,
  parseArguments,
  SECURITY_MIGRATION_COVERAGE_PREFIX
} from "../scripts/check-security-migrations.mjs";

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${String(result.stderr || "").trim()}`);
  return String(result.stdout || "").trim();
}

async function writeRepositoryFile(root, path, contents) {
  const fullPath = join(root, ...normalizeRepositoryPath(path).split("/"));
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, contents, "utf8");
}

function commitAll(root, message) {
  git(root, ["add", "--all"]);
  git(root, ["commit", "--quiet", "-m", message]);
  return git(root, ["rev-parse", "HEAD"]);
}

async function createTemporaryRepository(t, { initialCommit = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), "chained-security-gate-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  git(root, ["init", "--quiet"]);
  git(root, ["config", "user.name", "CHAINED Gate Test"]);
  git(root, ["config", "user.email", "security-gate@example.invalid"]);
  git(root, ["config", "commit.gpgsign", "false"]);
  git(root, ["config", "core.autocrlf", "false"]);
  if (initialCommit) {
    await writeRepositoryFile(root, "README.md", "fixture\n");
    commitAll(root, "Initial fixture");
  }
  return root;
}

function sorted(paths) {
  return [...paths].sort();
}

function fixture(files) {
  const normalized = new Map(Object.entries(files).map(([path, contents]) => [normalizeRepositoryPath(path), contents]));
  return evaluateSecurityMigrationGate({
    changedFiles: Object.keys(files),
    readText: async (path) => {
      assert.ok(normalized.has(path), `fixture contains ${path}`);
      return normalized.get(path);
    }
  });
}

test("ordinary schema migrations pass without security regression coverage", async () => {
  const result = await fixture({
    "supabase/migrations/20261001090000_add_artist_note.sql": "alter table public.public_profiles add column artist_note text;"
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.sensitive, []);
});

test("a security-sensitive migration passes with explicit changed pgTAP coverage", async () => {
  const migration = "20261001090100_profile_policy.sql";
  const result = await fixture({
    [`supabase/migrations/${migration}`]: "create policy profiles_public on public.public_profiles for select to anon using (publication_status = 'published');",
    "supabase/tests/041_profile_policy_security.test.sql": `begin;\n${SECURITY_MIGRATION_COVERAGE_PREFIX} ${migration}\nselect plan(2);\nrollback;`
  });
  assert.equal(result.ok, true);
  assert.equal(result.sensitive[0].coveragePath, "supabase/tests/041_profile_policy_security.test.sql");
});

for (const [label, sql, expectedReason] of [
  ["POLICY", "alter policy owner_read on public.works using (true);", "POLICY change"],
  ["GRANT", "grant execute on function private.allowed(uuid) to authenticated;", "GRANT"],
  ["REVOKE", "revoke all on public.works from anon;", "REVOKE"],
  ["SECURITY DEFINER", "create function private.allowed() returns boolean language sql security definer as $$ select true $$;", "SECURITY DEFINER"],
  ["storage.objects policy", "drop policy storage_upload on storage.objects;", "storage.objects policy change"]
]) {
  test(`${label} changes fail without explicit changed security coverage`, async () => {
    const result = await fixture({
      "supabase/migrations/20261001090200_sensitive.sql": sql
    });
    assert.equal(result.ok, false);
    assert.ok(result.sensitive[0].reasons.includes(expectedReason));
    const failure = formatGateFailure(result);
    assert.match(failure, /Security migration gate failed/);
    assert.match(failure, /-- Security migration coverage: 20261001090200_sensitive\.sql/);
  });
}

test("RLS mode and CREATE OR REPLACE FUNCTION changes are detected", () => {
  assert.deepEqual(
    detectSecuritySensitiveSql("alter table public.works force row level security;"),
    ["ROW LEVEL SECURITY change"]
  );
  assert.deepEqual(
    detectSecuritySensitiveSql("create or replace function public.visible() returns boolean language sql as $$ select true $$;"),
    ["FUNCTION change"]
  );
  assert.deepEqual(
    detectSecuritySensitiveSql("alter default privileges in schema public grant select on tables to anon;"),
    ["GRANT"]
  );
});

test("SQL comments and ordinary string values do not create obvious false positives", () => {
  const sql = `
    -- GRANT all on public.works to anon;
    /* create policy accidental on storage.objects using (true); */
    insert into public.audit_events(action, metadata)
    values ('REVOKE', '{"note":"SECURITY DEFINER"}'::jsonb);
  `;
  assert.deepEqual(detectSecuritySensitiveSql(sql), []);
});

test("Windows paths normalize and match their exact migration coverage marker", async () => {
  const result = await fixture({
    "supabase\\migrations\\20261001090300_windows_grant.sql": "GRANT usage on schema private to authenticated;",
    "supabase\\tests\\042_windows_grant.test.sql": "-- Security migration coverage: supabase/migrations/20261001090300_windows_grant.sql"
  });
  assert.equal(result.ok, true);
  assert.equal(result.changedMigrations[0], "supabase/migrations/20261001090300_windows_grant.sql");
});

test("multiple security migrations each require their own explicit marker", async () => {
  const files = {
    "supabase/migrations/20261001090400_first.sql": "grant select on public.works to anon;",
    "supabase/migrations/20261001090500_second.sql": "alter table public.works enable row level security;",
    "supabase/tests/043_multiple_security.test.sql": "-- Security migration coverage: 20261001090400_first.sql"
  };
  const missing = await fixture(files);
  assert.equal(missing.ok, false);
  assert.equal(missing.sensitive.filter((migration) => !migration.coveragePath).length, 1);

  files["supabase/tests/043_multiple_security.test.sql"] += "\n-- Security migration coverage: 20261001090500_second.sql";
  const covered = await fixture(files);
  assert.equal(covered.ok, true);
  assert.equal(covered.sensitive.length, 2);
});

test("an unrelated changed pgTAP test does not satisfy the explicit evidence contract", async () => {
  const result = await fixture({
    "supabase/migrations/20261001090600_revoke.sql": "revoke execute on function private.allowed(uuid) from anon;",
    "supabase/tests/044_unrelated.test.sql": "begin; select plan(1); select pass('unrelated'); rollback;"
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.changedTests, ["supabase/tests/044_unrelated.test.sql"]);
});

test("determineChangedFiles discovers an unstaged modified migration", async (t) => {
  const root = await createTemporaryRepository(t);
  const path = "supabase/migrations/20261001091000_unstaged.sql";
  await writeRepositoryFile(root, path, "select 1;\n");
  commitAll(root, "Add migration");
  await writeRepositoryFile(root, path, "select 2;\n");

  assert.deepEqual(determineChangedFiles({ root }), [path]);
});

test("determineChangedFiles discovers a staged modified migration", async (t) => {
  const root = await createTemporaryRepository(t);
  const path = "supabase/migrations/20261001091100_staged.sql";
  await writeRepositoryFile(root, path, "select 1;\n");
  commitAll(root, "Add migration");
  await writeRepositoryFile(root, path, "select 2;\n");
  git(root, ["add", "--", path]);

  assert.deepEqual(determineChangedFiles({ root }), [path]);
});

test("determineChangedFiles discovers untracked migration and pgTAP files", async (t) => {
  const root = await createTemporaryRepository(t);
  const migration = "supabase/migrations/20261001091200_untracked.sql";
  const pgTap = "supabase/tests/045_untracked.test.sql";
  await writeRepositoryFile(root, migration, "grant select on public.works to anon;\n");
  await writeRepositoryFile(root, pgTap, `-- Security migration coverage: 20261001091200_untracked.sql\n`);

  assert.deepEqual(sorted(determineChangedFiles({ root })), sorted([migration, pgTap]));
});

test("determineChangedFiles combines staged and unstaged modifications", async (t) => {
  const root = await createTemporaryRepository(t);
  const staged = "supabase/migrations/20261001091300_staged.sql";
  const unstaged = "supabase/migrations/20261001091400_unstaged.sql";
  await writeRepositoryFile(root, staged, "select 1;\n");
  await writeRepositoryFile(root, unstaged, "select 1;\n");
  commitAll(root, "Add migrations");
  await writeRepositoryFile(root, staged, "select 2;\n");
  git(root, ["add", "--", staged]);
  await writeRepositoryFile(root, unstaged, "select 3;\n");

  assert.deepEqual(sorted(determineChangedFiles({ root })), sorted([staged, unstaged]));
});

test("determineChangedFiles inspects the latest ordinary commit in a clean worktree", async (t) => {
  const root = await createTemporaryRepository(t);
  const path = "supabase/migrations/20261001091500_committed.sql";
  await writeRepositoryFile(root, path, "select 1;\n");
  commitAll(root, "Add committed migration");

  assert.deepEqual(determineChangedFiles({ root }), [path]);
});

test("determineChangedFiles uses an explicit base and head across multiple commits", async (t) => {
  const root = await createTemporaryRepository(t);
  const base = git(root, ["rev-parse", "HEAD"]);
  const migration = "supabase/migrations/20261001091600_range.sql";
  const pgTap = "supabase/tests/046_range.test.sql";
  await writeRepositoryFile(root, migration, "grant select on public.works to anon;\n");
  commitAll(root, "Add range migration");
  await writeRepositoryFile(root, pgTap, "-- Security migration coverage: 20261001091600_range.sql\n");
  const head = commitAll(root, "Add range coverage");

  assert.deepEqual(sorted(determineChangedFiles({ root, base, head })), sorted([migration, pgTap]));
});

test("determineChangedFiles compares a clean merge commit with its first parent", async (t) => {
  const root = await createTemporaryRepository(t);
  const firstParentBranch = git(root, ["branch", "--show-current"]);
  const migration = "supabase/migrations/20261001091700_merged.sql";
  git(root, ["checkout", "--quiet", "-b", "security-feature"]);
  await writeRepositoryFile(root, migration, "grant select on public.works to anon;\n");
  commitAll(root, "Add feature migration");
  git(root, ["checkout", "--quiet", firstParentBranch]);
  await writeRepositoryFile(root, "docs/first-parent.txt", "first parent\n");
  commitAll(root, "Advance first parent");
  git(root, ["merge", "--quiet", "--no-ff", "security-feature", "-m", "Merge security feature"]);

  assert.deepEqual(determineChangedFiles({ root }), [migration]);
});

test("determineChangedFiles handles a clean root commit", async (t) => {
  const root = await createTemporaryRepository(t, { initialCommit: false });
  const path = "supabase/migrations/20261001091800_root.sql";
  await writeRepositoryFile(root, path, "select 1;\n");
  commitAll(root, "Root migration");

  assert.deepEqual(determineChangedFiles({ root }), [path]);
});

test("determineChangedFiles normalizes Windows-style explicit paths", async (t) => {
  const root = await createTemporaryRepository(t);
  assert.deepEqual(determineChangedFiles({
    root,
    explicitFiles: ["supabase\\migrations\\20261001091900_windows.sql"]
  }), ["supabase/migrations/20261001091900_windows.sql"]);
});

test("CLI options fail clearly when their required value is missing", () => {
  for (const option of ["--base", "--head", "--file"]) {
    assert.throws(() => parseArguments([option]), new RegExp(`${option} requires a value\\.`));
  }
  assert.throws(
    () => parseArguments(["--base", "--head", "HEAD"]),
    /--base requires a value\./
  );
});
