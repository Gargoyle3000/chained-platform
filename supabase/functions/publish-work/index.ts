import { createMediaDependencies } from "../_shared/work-media.ts";
import { handlePublishWork } from "./logic.ts";

const dependencies = createMediaDependencies();

Deno.serve((request) => handlePublishWork(request, dependencies));

