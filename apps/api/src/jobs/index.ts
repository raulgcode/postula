import { pruneRateLimitsJob } from "./maintenance";
import type { JobDefinition } from "./queue";

/** Every job the worker runs. A new one goes here. */
export const jobs: readonly JobDefinition[] = [pruneRateLimitsJob];
