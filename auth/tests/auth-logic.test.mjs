import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_DASHBOARD_PAGE,
  GENERIC_LOGIN_CONFIRMATION,
  accountAccessDecision,
  mapLoginResult,
  resolveNextPage,
  sanitizeCallbackError
} from "../auth-logic.mjs";

test("known dashboard next page is accepted", () => {
  assert.equal(resolveNextPage("archive.html"), "archive.html");
});

test("safe Work editor identifier is preserved", () => {
  assert.equal(
    resolveNextPage("dashboard-work-edit.html?id=seed-hey-man"),
    "dashboard-work-edit.html?id=seed-hey-man"
  );
});

test("external URL is rejected", () => {
  assert.equal(resolveNextPage("https://example.test/dashboard.html"), DEFAULT_DASHBOARD_PAGE);
});

test("protocol-relative URL is rejected", () => {
  assert.equal(resolveNextPage("//example.test/dashboard.html"), DEFAULT_DASHBOARD_PAGE);
});

test("path traversal is rejected", () => {
  assert.equal(resolveNextPage("../dashboard.html"), DEFAULT_DASHBOARD_PAGE);
});

test("encoded bypass is rejected", () => {
  assert.equal(resolveNextPage("%2e%2e/dashboard.html"), DEFAULT_DASHBOARD_PAGE);
});

test("unknown dashboard page is rejected", () => {
  assert.equal(resolveNextPage("dashboard-settings.html"), DEFAULT_DASHBOARD_PAGE);
});

test("missing destination defaults to the main dashboard", () => {
  assert.equal(resolveNextPage(null), DEFAULT_DASHBOARD_PAGE);
});

test("login result mapping is generic even when a client error is supplied", () => {
  const success = mapLoginResult({ error: null });
  const hiddenAccount = mapLoginResult({ error: new Error("unknown user") });
  assert.equal(success.message, GENERIC_LOGIN_CONFIRMATION);
  assert.deepEqual(hiddenAccount, success);
});

test("active application account is admitted", () => {
  assert.equal(accountAccessDecision({ status: "active" }), "active");
});

test("suspended application account is denied", () => {
  assert.equal(accountAccessDecision({ status: "suspended" }), "suspended");
});

test("disabled application account is denied", () => {
  assert.equal(accountAccessDecision({ status: "disabled" }), "disabled");
});

test("missing application account is denied", () => {
  assert.equal(accountAccessDecision(null), "missing");
});

test("callback errors are sanitized and never reflected", () => {
  const unsafe = "token=private-value and internal database detail";
  const message = sanitizeCallbackError(unsafe);
  assert.equal(message.includes("private-value"), false);
  assert.equal(message.includes("database detail"), false);
});

