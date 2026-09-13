import { createMediaCorsHandler, readAllowedMediaOrigins } from "../_shared/work-media-cors.ts";
import { createMediaDependencies } from "../_shared/work-media.ts";
import { handleDeletePresentationAgendaImage } from "./logic.ts";

const dependencies = createMediaDependencies();

Deno.serve(createMediaCorsHandler(
  (request) => handleDeletePresentationAgendaImage(request, dependencies),
  readAllowedMediaOrigins(),
));
