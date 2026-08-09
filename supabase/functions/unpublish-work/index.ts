import { createMediaCorsHandler, readAllowedMediaOrigins } from "../_shared/work-media-cors.ts";
import { createMediaDependencies } from "../_shared/work-media.ts";
import { handleUnpublishWork } from "./logic.ts";

const dependencies = createMediaDependencies();

const handler = createMediaCorsHandler(
  (request) => handleUnpublishWork(request, dependencies),
  readAllowedMediaOrigins(),
);

Deno.serve(handler);
