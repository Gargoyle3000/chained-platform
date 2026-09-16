import test from "node:test";
import assert from "node:assert/strict";
import { createPresentationAgendaImageService } from "../data/presentation-agenda-image-service.mjs";

const PRESENTATION_ID = "11111111-1111-4111-8111-111111111111";
const IMAGE_ID = "22222222-2222-4222-8222-222222222222";
const WORK_ID = "33333333-3333-4333-8333-333333333333";

function createClient(finalize = { ok: true, status: "ready" }) {
  const calls = [];
  return {
    calls,
    auth: {
      async getSession() {
        return { data: { session: { access_token: "session-token" } }, error: null };
      }
    },
    async rpc(name, args) {
      calls.push({ kind: "rpc", name, args });
      if (name === "set_presentation_representative_work") {
        return { data: true, error: null };
      }
      return {
        data: [{
          image_id: IMAGE_ID,
          bucket_id: "presentation-agenda-media",
          object_path: "presentation/original.webp",
          preview_object_path: "presentation/preview.webp"
        }],
        error: null
      };
    },
    storage: {
      from(bucket) {
        return {
          async upload(path) {
            calls.push({ kind: "upload", bucket, path });
            return { error: null };
          }
        };
      }
    },
    functions: {
      async invoke(name, options) {
        calls.push({ kind: "invoke", name, options });
        return { data: finalize, error: null };
      }
    }
  };
}

test("Agenda image upload finalizes the reserved image with the active session", async () => {
  const client = createClient();
  const service = createPresentationAgendaImageService(client, {
    createPreview: async () => ({ size: 5 })
  });
  const file = { name: "agenda.webp", type: "image/webp", size: 5 };

  await service.upload(PRESENTATION_ID, file);

  const finalization = client.calls.find((call) => call.kind === "invoke");
  assert.deepEqual(finalization, {
    kind: "invoke",
    name: "finalize-presentation-agenda-image",
    options: {
      body: { image_id: IMAGE_ID },
      headers: { Authorization: "Bearer session-token" }
    }
  });
});

test("Representative Work selection persists immediately through its dedicated RPC", async () => {
  const client = createClient();
  const service = createPresentationAgendaImageService(client);

  await service.setRepresentativeWork(PRESENTATION_ID, WORK_ID);

  assert.deepEqual(client.calls[0], {
    kind: "rpc",
    name: "set_presentation_representative_work",
    args: {
      target_presentation_id: PRESENTATION_ID,
      target_work_id: WORK_ID
    }
  });
});

test("Agenda image upload never reports success before the verifier reports ready", async () => {
  const client = createClient({ ok: true, status: "reserved" });
  const service = createPresentationAgendaImageService(client, {
    createPreview: async () => ({ size: 5 })
  });
  const file = { name: "agenda.webp", type: "image/webp", size: 5 };

  await assert.rejects(
    () => service.upload(PRESENTATION_ID, file),
    /AGENDA IMAGE COULD NOT BE VERIFIED/
  );
});
