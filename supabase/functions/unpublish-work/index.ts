import { createMediaDependencies } from "../_shared/work-media.ts";
import { handleUnpublishWork } from "./logic.ts";

const dependencies = createMediaDependencies();

Deno.serve((request) => handleUnpublishWork(request, dependencies));

