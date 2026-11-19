import { pruneRateLimitsJob } from "./maintenance";
import type { JobDefinition } from "./queue";
import { dispatchSearchesJob, runSearchJob } from "./searches";

/** Every job the worker runs. A new one goes here. */
export const jobs: readonly JobDefinition[] = [
  pruneRateLimitsJob,
  dispatchSearchesJob,
  runSearchJob as JobDefinition,
];
