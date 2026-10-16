import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const migrationName = "20261016130000_reconcile_public_table_acl.sql";
const migration = await readFile(new URL("../supabase/migrations/" + migrationName, import.meta.url), "utf8");
const coverage = await readFile(new URL("../supabase/tests/042_public_table_acl.test.sql", import.meta.url), "utf8");
const directory = new URL("../supabase/migrations/", import.meta.url);
const historical = (await Promise.all((await readdir(directory)).filter(name => name < migrationName)
  .map(name => readFile(new URL(name, directory), "utf8")))).join("\n");
const tableNames = [...historical.matchAll(/create table (?:if not exists )?public\.(\w+)/gi)]
  .map(match => match[1]).sort();
const principals = ["public", "anon", "authenticated", "service_role"];
const columnOperations = ["select", "insert", "update", "references"];
const tableOperations = [...columnOperations, "delete", "truncate", "trigger", "maintain"];
const list = value => value.trim() ? value.split(",").map(item => item.trim()) : [];
const statements = migration.replace(/--[^\n]*/g, "").split(";").map(s => s.trim()).filter(Boolean);
const expected = [...coverage.matchAll(/\('([^']+)', '([^']+)', '([^']*)', '([^']*)', '([^']*)', (true|false)\)/g)]
  .map(([, table, role, select, insert, update, canDelete]) => ({ table, role,
    select: list(select), insert: list(insert), update: list(update), references: [], canDelete: canDelete === "true" }));
const columnResets = new Map([...migration.matchAll(/revoke all privileges \(([\s\S]*?)\) on table public\.(\w+) from public, anon, authenticated, service_role;/g)]
  .map(([, columns, table]) => [table, list(columns)]));

// This deliberately models table/column grants separately: REVOKE at the table
// level must not accidentally hide a surviving legacy attacl grant in this test.
function reconcile(legacy) {
  const state = new Map();
  for (const table of tableNames) for (const role of principals) {
    state.set(table + ":" + role, {
      table: new Set(legacy === "broad" ? tableOperations : []),
      columns: Object.fromEntries(columnOperations.map(operation => [operation,
        new Set(legacy === "broad" || legacy === "columns" ? columnResets.get(table) : [])]))
    });
  }
  for (const statement of statements) {
    const reset = statement.match(/^revoke all privileges(?: \(([\s\S]*?)\))? on table public\.(\w+) from (.+)$/);
    if (reset) {
      for (const role of list(reset[3])) {
        const acl = state.get(reset[2] + ":" + role);
        if (reset[1]) for (const operation of columnOperations) for (const column of list(reset[1])) acl.columns[operation].delete(column);
        else acl.table.clear();
      }
      continue;
    }
    const grant = statement.match(/^grant (select|insert|update|delete)(?: \(([\s\S]*?)\))? on table public\.(\w+) to (anon|authenticated|service_role)$/);
    assert.ok(grant, "unexpected SQL outside the explicit table ACL reconciliation: " + statement);
    const acl = state.get(grant[3] + ":" + grant[4]);
    if (grant[2]) for (const column of list(grant[2])) acl.columns[grant[1]].add(column);
    else acl.table.add(grant[1]);
  }
  return state;
}

function verifyContract(state) {
  for (const row of expected) {
    const acl = state.get(row.table + ":" + row.role);
    assert.deepEqual([...acl.table].sort(), row.canDelete ? ["delete"] : [], row.table + ":" + row.role + " relation privileges");
    for (const operation of columnOperations) {
      assert.deepEqual([...acl.columns[operation]].sort(), row[operation], row.table + ":" + row.role + ":" + operation);
    }
  }
  for (const table of tableNames) {
    const acl = state.get(table + ":public");
    assert.equal(acl.table.size, 0, table + " PUBLIC relation ACL");
    for (const operation of columnOperations) assert.equal(acl.columns[operation].size, 0, table + " PUBLIC " + operation);
  }
}

test("forward migration reconciles exactly the 31 public tables and changes only direct ACLs", () => {
  assert.equal(tableNames.length, 31);
  assert.deepEqual([...columnResets.keys()].sort(), tableNames);
  const relationResets = [...migration.matchAll(/revoke all privileges on table public\.(\w+) from public, anon, authenticated, service_role;/g)].map(match => match[1]).sort();
  assert.deepEqual(relationResets, tableNames);
  assert.equal(expected.length, 93);
  assert.equal(new Set(expected.map(row => row.table + ":" + row.role)).size, 93);
  assert.deepEqual([...new Set(expected.map(row => row.role))].sort(), principals.filter(role => role !== "public").sort());
  assert.ok(coverage.includes("-- Security migration coverage: " + migrationName));
  assert.doesNotMatch(statements.join(";"), /\b(?:alter|create|drop|function|schema|policy|storage|cascade)\b|default privileges|with grant option/i);
  verifyContract(reconcile("none"));
});

for (const legacy of ["broad", "columns"]) test("exact contract survives legacy " + legacy + " grants, including PUBLIC", () => {
  verifyContract(reconcile(legacy));
});

test("service invitation adapter dependencies include filters, order, payloads and returning projections", async () => {
  const source = await readFile(new URL("../supabase/functions/invite-account/index.ts", import.meta.url), "utf8");
  const lookup = (table, role) => expected.find(row => row.table === table && row.role === role);
  const invitation = lookup("account_invitations", "service_role");
  assert.deepEqual(invitation.select, ["approved_account_plan", "approved_roles", "artist_workspace_display_name", "artist_workspace_slug", "created_at", "email_normalized", "expires_at", "id", "status"]);
  assert.deepEqual(invitation.insert, ["approved_account_plan", "approved_by_account_id", "approved_roles", "artist_workspace_display_name", "artist_workspace_slug", "email_normalized"]);
  assert.deepEqual(invitation.update, ["failure_code", "status"]);
  assert.deepEqual(lookup("public_profiles", "service_role").select, ["deleted_at", "id", "slug"]);
  for (const match of source.matchAll(/restUrl\("account_invitations", \{([\s\S]*?)\}\)/g)) {
    const options = match[1];
    for (const select of options.matchAll(/select: "([^"]+)"/g)) for (const column of list(select[1])) assert.ok(invitation.select.includes(column), column + " must be readable");
    for (const key of ["id", "status", "email_normalized", "artist_workspace_slug"]) {
      if (options.includes(key + ":")) assert.ok(invitation.select.includes(key), key + " filter must be readable");
    }
    if (options.includes('order: "created_at.desc"')) assert.ok(invitation.select.includes("created_at"));
  }
  const methodBody = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
  const payloadColumns = body => [...body.matchAll(/body: JSON.stringify\(\{([\s\S]*?)\}\)/g)]
    .flatMap(([, object]) => [...object.matchAll(/(?:^|,)\s*(\w+):/g)].map(match => match[1]));
  assert.deepEqual(payloadColumns(methodBody("async approveInvitation", "async claimInvitationForSending")).sort(), invitation.insert);
  assert.deepEqual([...new Set([
    ...payloadColumns(methodBody("async claimInvitationForSending", "readInvitation: readInvitationById")),
    ...payloadColumns(methodBody("async markInvitationFailed", "async repairAcceptedArtistWorkspace"))
  ])].sort(), invitation.update);
  assert.match(source, /restUrl\("public_profiles", \{[\s\S]*?deleted_at: "is.null"/);
  for (const row of expected.filter(row => row.role === "service_role" && !["account_invitations", "public_profiles"].includes(row.table))) {
    assert.deepEqual([row.select, row.insert, row.update, row.canDelete], [[], [], [], false], row.table + " must use trusted routes");
  }
});

test("F1 projections and lifecycle write restrictions survive reconciliation", async () => {
  const f1 = await readFile(new URL("../supabase/migrations/20261016120000_activity_browser_select_columns.sql", import.meta.url), "utf8");
  const f1Select = new Map();
  for (const [, columns, table, roles] of f1.matchAll(/grant select \(([\s\S]*?)\) on public\.(\w+) to ([^;]+);/g)) {
    for (const role of list(roles)) {
      const key = table + ":" + role;
      f1Select.set(key, [...(f1Select.get(key) || []), ...list(columns)].sort());
    }
  }
  for (const [key, columns] of f1Select) {
    const row = expected.find(row => row.table + ":" + row.role === key);
    assert.deepEqual(row.select, columns, key + " preserves the complete F1 projection");
  }
  for (const table of ["profile_activities", "activity_occurrences"]) {
    for (const row of expected.filter(row => row.table === table && row.role !== "service_role")) {
      for (const column of ["created_by_account_id", "updated_by_account_id", "deleted_by_account_id", "purge_after"]) {
        for (const operation of ["select", "insert", "update"]) assert.ok(!row[operation].includes(column), table + ":" + row.role + ":" + operation + ":" + column);
      }
    }
  }
  const anon = expected.find(row => row.table === "activity_occurrences" && row.role === "anon");
  assert.ok(!anon.select.includes("show_in_presentation"));
  const managed = expected.find(row => row.table === "activity_occurrences" && row.role === "authenticated");
  assert.ok(managed.select.includes("show_in_presentation") && managed.select.includes("deleted_at"));
  const images = expected.find(row => row.table === "work_images" && row.role === "authenticated");
  assert.equal(images.insert.length, 10, "intentional duplicate-cover compatibility contract remains");
  assert.deepEqual(images.update, ["original_filename", "pixel_height", "pixel_width"]);
});
