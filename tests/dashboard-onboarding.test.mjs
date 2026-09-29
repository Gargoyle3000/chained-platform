import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DASHBOARD_ONBOARDING_VERSION,
  acknowledgeDashboardOnboarding,
  readDashboardOnboardingEligibility
} from "../data/dashboard-onboarding-repository.mjs";
import { mountDashboardOnboarding, ONBOARDING_STEPS } from "../data/dashboard-onboarding.mjs";

function clientFor({ version = 0, status = "active", roles = [{ role: "artist", revoked_at: null }], memberships = [{ profile_id: "profile-1", membership_level: "owner", status: "active", revoked_at: null }], profiles = [{ id: "profile-1", profile_type: "artist", claim_state: "claimed" }], errorTable = null, user = "artist-1" } = {}) {
  const writes = [];
  const tables = {
    accounts: [{ status, onboarding_acknowledged_version: version }],
    account_roles: roles,
    profile_members: memberships,
    public_profiles: profiles
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: user ? { id: user } : null }, error: null }) },
    from(table) {
      let rows = tables[table];
      let isWrite = false;
      const query = {
        select() { return query; },
        eq(column, value) {
          if (!isWrite) rows = rows.filter((row) => row[column] === undefined || row[column] === value);
          return query;
        },
        lt() { return query; },
        is(column, value) { rows = rows.filter((row) => row[column] === value); return query; },
        in(column, values) { rows = rows.filter((row) => values.includes(row[column])); return query; },
        update(value) { isWrite = true; writes.push(value); rows = [{ onboarding_acknowledged_version: value.onboarding_acknowledged_version }]; return query; },
        maybeSingle: async () => ({ data: errorTable === table ? null : rows[0] || null, error: errorTable === table ? new Error("unavailable") : null }),
        then(resolve) { return Promise.resolve({ data: errorTable === table ? null : rows, error: errorTable === table ? new Error("unavailable") : null }).then(resolve); }
      };
      return query;
    }
  };
  return { client, writes };
}

test("Dashboard onboarding eligibility requires active Artist account and an owned claimed Workspace", async () => {
  const cases = [
    [{}, "eligible"],
    [{ version: 1 }, "ineligible"],
    [{ version: 2 }, "ineligible"],
    [{ status: "suspended" }, "ineligible"],
    [{ roles: [{ role: "admin", revoked_at: null }] }, "ineligible"],
    [{ roles: [{ role: "artist", revoked_at: "2026-01-01" }] }, "ineligible"],
    [{ memberships: [] }, "ineligible"],
    [{ memberships: [{ profile_id: "profile-1", membership_level: "owner", status: "revoked", revoked_at: "2026-01-01" }] }, "ineligible"],
    [{ profiles: [{ id: "profile-1", profile_type: "artist", claim_state: "unclaimed_gallery_managed" }] }, "ineligible"],
    [{ profiles: [{ id: "profile-1", profile_type: "gallery", claim_state: "claimed" }] }, "ineligible"],
    [{ roles: [{ role: "admin", revoked_at: null }, { role: "artist", revoked_at: null }] }, "eligible"],
    [{ user: null }, "ineligible"],
    [{ errorTable: "accounts" }, "unavailable"],
    [{ errorTable: "public_profiles" }, "unavailable"]
  ];
  for (const [options, kind] of cases) {
    assert.equal((await readDashboardOnboardingEligibility(clientFor(options).client)).kind, kind, JSON.stringify(options));
  }
});

function acknowledgementClient({ version = 0, user = "artist-1", writeError = false, readError = false, missing = false, forceNoMatch = false } = {}) {
  const operations = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: user ? { id: user } : null }, error: null }) },
    from(table) {
      assert.equal(table, "accounts");
      const operation = { kind: "read" };
      operations.push(operation);
      const query = {
        update(value) { operation.kind = "write"; operation.value = value; return query; },
        select(columns) { operation.columns = columns; return query; },
        eq(column, value) { operation.account = [column, value]; return query; },
        lt(column, value) { operation.guard = [column, value]; return query; },
        async maybeSingle() {
          if (operation.kind === "write") {
            if (writeError) return { data: null, error: new Error("write failed") };
            if (forceNoMatch || version >= DASHBOARD_ONBOARDING_VERSION) return { data: null, error: null };
            version = DASHBOARD_ONBOARDING_VERSION;
            return { data: { onboarding_acknowledged_version: version }, error: null };
          }
          if (readError) return { data: null, error: new Error("read failed") };
          return { data: missing ? null : { onboarding_acknowledged_version: version }, error: null };
        }
      };
      return query;
    }
  };
  return { client, operations, currentVersion: () => version };
}

test("acknowledgement is idempotent across sessions without downgrading future versions", async () => {
  for (const [version, expectedReads] of [[0, 1], [1, 2], [3, 2]]) {
    const fixture = acknowledgementClient({ version });
    assert.equal(await acknowledgeDashboardOnboarding(fixture.client, "artist-1"), true);
    assert.equal(fixture.currentVersion(), Math.max(version, DASHBOARD_ONBOARDING_VERSION));
    assert.equal(fixture.operations.length, expectedReads);
    assert.deepEqual(fixture.operations[0].value, { onboarding_acknowledged_version: 1 });
    assert.deepEqual(fixture.operations[0].guard, ["onboarding_acknowledged_version", 1]);
    assert.deepEqual(fixture.operations[0].account, ["id", "artist-1"]);
    if (expectedReads === 2) {
      assert.equal(fixture.operations[1].kind, "read");
      assert.deepEqual(fixture.operations[1].account, ["id", "artist-1"]);
    }
  }
});

test("acknowledgement does not infer success from write/read failure, missing data, lower version, or account mismatch", async () => {
  for (const options of [
    { version: 1, writeError: true },
    { version: 1, readError: true },
    { version: 1, missing: true },
    { version: 0, forceNoMatch: true }
  ]) {
    const fixture = acknowledgementClient(options);
    assert.equal(await acknowledgeDashboardOnboarding(fixture.client, "artist-1"), false, JSON.stringify(options));
    if (options.writeError) assert.equal(fixture.operations.length, 1, "a genuine write error does not trigger a fallback read");
  }
  const mismatch = acknowledgementClient({ user: "other" });
  assert.equal(await acknowledgeDashboardOnboarding(mismatch.client, "artist-1"), false);
  assert.equal(mismatch.operations.length, 0);
  const anonymous = acknowledgementClient({ user: null });
  assert.equal(await acknowledgeDashboardOnboarding(anonymous.client, "artist-1"), false);
  assert.equal(anonymous.operations.length, 0);
});

function fakeSurface() {
  const controls = new Map();
  const make = () => ({ hidden: false, disabled: false, textContent: "", isConnected: true, handlers: {}, focus() { document.activeElement = this; }, addEventListener(type, handler) { this.handlers[type] = handler; }, async click() { return this.handlers.click?.(); } });
  for (const key of ["heading", "copy", "progress", "feedback", "back", "next", "finish", "skip", "retry", "dismiss"]) controls.set(key, make());
  const document = { body: { dataset: { authMode: "supabase" } }, activeElement: null, querySelector: () => controls.get("back"), getElementById: () => dialog };
  const dialog = { open: false, handlers: {}, querySelector(selector) { return controls.get(selector.match(/data-onboarding-(\w+)/)?.[1]); }, addEventListener(type, handler) { this.handlers[type] = handler; }, showModal() { this.open = true; }, close() { this.open = false; } };
  const events = {};
  const pageWindow = { addEventListener(type, handler) { events[type] = handler; } };
  return { controls, document, dialog, events, pageWindow };
}

test("already-ready and repeated auth events open one seven-step dialog with bounded navigation and focus", async () => {
  const surface = fakeSurface();
  let reads = 0;
  const controller = mountDashboardOnboarding({ pageWindow: surface.pageWindow, pageDocument: surface.document, getRuntime: async () => ({ mode: "supabase", client: {} }), readEligibility: async () => { reads += 1; return { kind: "eligible", accountId: "artist-1" }; } });
  await controller.ready;
  assert.equal(surface.dialog.open, true);
  assert.equal(surface.controls.get("progress").textContent, "1 / 7");
  assert.equal(surface.controls.get("back").disabled, true);
  assert.equal(surface.document.activeElement, surface.controls.get("heading"));
  await controller.onReady();
  assert.equal(reads, 1);
  await surface.controls.get("back").click();
  assert.equal(surface.controls.get("progress").textContent, "1 / 7");
  for (let i = 1; i < ONBOARDING_STEPS.length; i += 1) await surface.controls.get("next").click();
  assert.equal(surface.controls.get("progress").textContent, "7 / 7");
  assert.equal(surface.controls.get("next").hidden, true);
  assert.equal(surface.controls.get("finish").hidden, false);
  await surface.controls.get("back").click();
  assert.equal(surface.controls.get("progress").textContent, "6 / 7");
});

test("later auth-ready opens once; prototype and failed state reads leave Dashboard usable", async () => {
  const surface = fakeSurface();
  surface.document.body.dataset.authMode = "prototype";
  let reads = 0;
  const controller = mountDashboardOnboarding({ pageWindow: surface.pageWindow, pageDocument: surface.document, getRuntime: async () => ({ mode: "supabase", client: {} }), readEligibility: async () => { reads += 1; return { kind: "eligible", accountId: "artist-1" }; } });
  await controller.ready;
  await controller.onReady({ detail: { mode: "prototype" } });
  assert.equal(surface.dialog.open, false);
  surface.document.body.dataset.authMode = "supabase";
  await surface.events["chained:auth-ready"]({ detail: { mode: "supabase" } });
  assert.equal(surface.dialog.open, true);
  assert.equal(reads, 1);
  const unavailable = fakeSurface();
  const failed = mountDashboardOnboarding({ pageWindow: unavailable.pageWindow, pageDocument: unavailable.document, getRuntime: async () => ({ mode: "supabase", client: {} }), readEligibility: async () => ({ kind: "unavailable" }), acknowledge: async () => { throw new Error("must not write"); } });
  await failed.ready;
  assert.equal(unavailable.dialog.open, false);
});

test("SKIP, FINISH and Escape persist; failure offers retry or page-only dismissal", async () => {
  for (const action of ["skip", "finish", "escape"]) {
    const surface = fakeSurface();
    let writes = 0;
    const controller = mountDashboardOnboarding({ pageWindow: surface.pageWindow, pageDocument: surface.document, getRuntime: async () => ({ mode: "supabase", client: {} }), readEligibility: async () => ({ kind: "eligible", accountId: "artist-1" }), acknowledge: async () => { writes += 1; return true; } });
    await controller.ready;
    if (action === "finish") for (let i = 1; i < ONBOARDING_STEPS.length; i += 1) await surface.controls.get("next").click();
    if (action === "escape") {
      let prevented = false;
      await surface.dialog.handlers.cancel({ preventDefault() { prevented = true; } });
      assert.equal(prevented, true);
    } else await surface.controls.get(action).click();
    assert.equal(writes, 1);
    assert.equal(surface.dialog.open, false);
    await controller.onReady();
    assert.equal(surface.dialog.open, false);
  }
  const surface = fakeSurface();
  let writes = 0;
  const controller = mountDashboardOnboarding({ pageWindow: surface.pageWindow, pageDocument: surface.document, getRuntime: async () => ({ mode: "supabase", client: {} }), readEligibility: async () => ({ kind: "eligible", accountId: "artist-1" }), acknowledge: async () => (++writes === 2) });
  await controller.ready;
  await surface.controls.get("skip").click();
  assert.equal(surface.dialog.open, true);
  assert.equal(surface.controls.get("feedback").hidden, false);
  assert.equal(surface.controls.get("retry").hidden, false);
  await surface.controls.get("retry").click();
  assert.equal(surface.dialog.open, false);
  assert.equal(writes, 2);
  const later = fakeSurface();
  const dismissed = mountDashboardOnboarding({ pageWindow: later.pageWindow, pageDocument: later.document, getRuntime: async () => ({ mode: "supabase", client: {} }), readEligibility: async () => ({ kind: "eligible", accountId: "artist-1" }), acknowledge: async () => false });
  await dismissed.ready;
  await later.controls.get("skip").click();
  await later.controls.get("dismiss").click();
  assert.equal(later.dialog.open, false);
  await dismissed.onReady();
  assert.equal(later.dialog.open, false);
  assert.equal(later.controls.get("feedback").textContent.includes("COULD NOT SAVE"), true);
  const refreshed = fakeSurface();
  const afterRefresh = mountDashboardOnboarding({ pageWindow: refreshed.pageWindow, pageDocument: refreshed.document, getRuntime: async () => ({ mode: "supabase", client: {} }), readEligibility: async () => ({ kind: "eligible", accountId: "artist-1" }) });
  await afterRefresh.ready;
  assert.equal(refreshed.dialog.open, true, "a page-only dismissal does not persist completion");
});

test("onboarding is mounted only on Dashboard; other protected routes keep their guard destination", async () => {
  const page = await readFile(new URL("../dashboard.html", import.meta.url), "utf8");
  assert.match(page, /id="dashboard-onboarding-dialog"/);
  assert.match(page, /data\/dashboard-onboarding\.mjs/);
  const guard = await readFile(new URL("../auth/guard.mjs", import.meta.url), "utf8");
  assert.match(guard, /resolveNextPage/);
  assert.match(guard, /chained:auth-ready/);
  assert.doesNotMatch(guard, /dashboard-onboarding/);
});
