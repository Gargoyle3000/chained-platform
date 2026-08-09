import { createMediaCorsHandler } from "./work-media-cors.ts";

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

const ALLOWED_ORIGIN = "https://chained.work";

function allowedRequest(method = "POST"): Request {
  return new Request("https://example.test/function", {
    method,
    headers: {
      origin: ALLOWED_ORIGIN,
      authorization: "Bearer test",
      "content-type": "application/json",
    },
    body: method === "POST" ? "{}" : undefined,
  });
}

Deno.test("media CORS answers allowed preflight", async () => {
  let called = false;

  const handler = createMediaCorsHandler(
    () => {
      called = true;
      return new Response("unexpected");
    },
    new Set([ALLOWED_ORIGIN]),
  );

  const response = await handler(allowedRequest("OPTIONS"));

  assert(response.status === 204);
  assert(!called);
  assert(response.headers.get("access-control-allow-origin") === ALLOWED_ORIGIN);

  const allowedHeaders =
    response.headers.get("access-control-allow-headers") ?? "";

  assert(allowedHeaders.includes("authorization"));
  assert(allowedHeaders.includes("apikey"));
  assert(allowedHeaders.includes("x-client-info"));
  assert(allowedHeaders.includes("content-type"));
});

Deno.test("media CORS adds headers to normal responses", async () => {
  const handler = createMediaCorsHandler(
    () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    new Set([ALLOWED_ORIGIN]),
  );

  const response = await handler(allowedRequest());

  assert(response.status === 200);
  assert(response.headers.get("access-control-allow-origin") === ALLOWED_ORIGIN);
  assert(response.headers.get("vary") === "Origin");
});

Deno.test("media CORS rejects an unknown browser origin", async () => {
  const handler = createMediaCorsHandler(
    () => new Response("unexpected"),
    new Set([ALLOWED_ORIGIN]),
  );

  const response = await handler(
    new Request("https://example.test/function", {
      method: "OPTIONS",
      headers: { origin: "https://evil.example" },
    }),
  );

  const body = await response.json();

  assert(response.status === 403);
  assert(body.error === "origin_not_allowed");
  assert(response.headers.get("access-control-allow-origin") === null);
});

Deno.test("media CORS allows non-browser requests to reach normal authorization", async () => {
  let called = false;

  const handler = createMediaCorsHandler(
    () => {
      called = true;
      return new Response(null, { status: 401 });
    },
    new Set([ALLOWED_ORIGIN]),
  );

  const response = await handler(
    new Request("https://example.test/function", { method: "POST" }),
  );

  assert(called);
  assert(response.status === 401);
  assert(response.headers.get("access-control-allow-origin") === null);
});
