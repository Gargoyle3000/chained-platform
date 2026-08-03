import { createMediaDependencies } from "../_shared/work-media.ts";
import { handleFinalizeWorkImageUpload } from "./logic.ts";

const dependencies = createMediaDependencies();

Deno.serve((request) => handleFinalizeWorkImageUpload(request, dependencies));

