import { createMediaCorsHandler, readAllowedMediaOrigins } from "../_shared/work-media-cors.ts";
import { createMediaDependencies } from "../_shared/work-media.ts";
import {
  createAuthorizedPrivateMediaDependencies,
  handleAuthorizedPrivateMedia,
} from "./logic.ts";

const dependencies = createAuthorizedPrivateMediaDependencies(createMediaDependencies());

const handler = createMediaCorsHandler(
  (request) => handleAuthorizedPrivateMedia(request, dependencies),
  readAllowedMediaOrigins(),
);

Deno.serve(handler);
