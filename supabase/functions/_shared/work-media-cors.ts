import { errorResponse, MediaError } from "./work-media.ts";

type MediaRequestHandler = (request: Request) => Promise<Response> | Response;

const ALLOWED_HEADERS = "authorization, x-client-info, apikey, content-type";

export function readAllowedMediaOrigins(): ReadonlySet<string> {
  return new Set(
    (Deno.env.get("ALLOWED_MEDIA_ORIGINS") ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function resolveMediaCors(
  request: Request,
  allowedOrigins: ReadonlySet<string>,
): HeadersInit {
  const origin = request.headers.get("origin");

  if (!origin) return {};

  if (!allowedOrigins.has(origin)) {
    throw new MediaError(403, "origin_not_allowed");
  }

  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": ALLOWED_HEADERS,
    "access-control-max-age": "600",
    vary: "Origin",
  };
}

function withHeaders(response: Response, extraHeaders: HeadersInit): Response {
  const headers = new Headers(response.headers);

  new Headers(extraHeaders).forEach((value, key) => {
    headers.set(key, value);
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function createMediaCorsHandler(
  handler: MediaRequestHandler,
  allowedOrigins: ReadonlySet<string>,
): MediaRequestHandler {
  return async (request: Request): Promise<Response> => {
    let corsHeaders: HeadersInit;

    try {
      corsHeaders = resolveMediaCors(request, allowedOrigins);
    } catch (error) {
      return errorResponse(error);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    const response = await handler(request);
    return withHeaders(response, corsHeaders);
  };
}
