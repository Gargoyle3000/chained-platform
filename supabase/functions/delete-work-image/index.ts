import { createMediaDependencies } from "../_shared/work-media.ts";
import { handleDeleteWorkImage } from "./logic.ts";

const dependencies = createMediaDependencies();

Deno.serve((request) => handleDeleteWorkImage(request, dependencies));

