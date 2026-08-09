import { createMediaCorsHandler, readAllowedMediaOrigins } from "../_shared/work-media-cors.ts";
import { createMediaDependencies } from "../_shared/work-media.ts";
import { handlePublishWork } from "./logic.ts";

const dependencies = createMediaDependencies();

const handler = createMediaCorsHandler(
  (request) => handlePublishWork(request, dependencies),
  readAllowedMediaOrigins(),
);

Deno.serve(handler);
