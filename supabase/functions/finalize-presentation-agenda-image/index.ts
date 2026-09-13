import { createMediaCorsHandler, readAllowedMediaOrigins } from "../_shared/work-media-cors.ts";
import { createMediaDependencies } from "../_shared/work-media.ts";
import { handleFinalizePresentationAgendaImage } from "./logic.ts";

Deno.serve(createMediaCorsHandler(
  (request) => handleFinalizePresentationAgendaImage(request, createMediaDependencies()),
  readAllowedMediaOrigins(),
));
