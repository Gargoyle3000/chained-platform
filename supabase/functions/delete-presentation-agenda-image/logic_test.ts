import assert from "node:assert/strict";
import test from "node:test";
import { handleDeletePresentationAgendaImage } from "./logic.ts";

const PRESENTATION_ID = "11111111-1111-4111-8111-111111111111";
const IMAGE_ID = "22222222-2222-4222-8222-222222222222";
const ACCOUNT_ID = "33333333-3333-4333-8333-333333333333";

function request() {
  return new Request("https://example.test/delete-presentation-agenda-image", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer test" },
    body: JSON.stringify({ presentation_id: PRESENTATION_ID }),
  });
}

function dependencies(removeResult: boolean) {
  const calls: Array<{ name: string; body: Record<string, unknown> }> = [];
  return {
    calls,
    async authenticate() {
      return { accountId: ACCOUNT_ID };
    },
    async rpc(name: string, body: Record<string, unknown>) {
      calls.push({ name, body });
      if (name === "service_get_presentation_agenda_image_removal") {
        return { image_id: IMAGE_ID, paths: ["presentation/original.jpg", "presentation/agenda.webp"] };
      }
      return true;
    },
    async remove(bucket: string, paths: string[]) {
      assert.equal(bucket, "presentation-agenda-media");
      assert.deepEqual(paths, ["presentation/original.jpg", "presentation/agenda.webp"]);
      return removeResult;
    },
  };
}

test("delete removes only server-derived paths before generation-bound database finalization", async () => {
  const deps = dependencies(true);
  const response = await handleDeletePresentationAgendaImage(request(), deps as never);
  assert.equal(response.status, 200);
  assert.deepEqual(deps.calls, [
    {
      name: "service_get_presentation_agenda_image_removal",
      body: { target_presentation_id: PRESENTATION_ID, actor_account_id: ACCOUNT_ID },
    },
    {
      name: "service_remove_presentation_agenda_image",
      body: { target_presentation_id: PRESENTATION_ID, expected_image_id: IMAGE_ID, actor_account_id: ACCOUNT_ID },
    },
  ]);
});

test("failed private Storage cleanup does not finalize database removal", async () => {
  const deps = dependencies(false);
  const response = await handleDeletePresentationAgendaImage(request(), deps as never);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { ok: false, error: "cleanup_failed" });
  assert.deepEqual(deps.calls.map((call) => call.name), ["service_get_presentation_agenda_image_removal"]);
});
