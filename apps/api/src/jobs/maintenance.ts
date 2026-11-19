import { pruneRateLimits } from "@postula/core";
import { defineJob } from "./queue";

/** Every hour: forgets the rate-limit windows that ended long ago, so the table stays small. */
export const pruneRateLimitsJob = defineJob({
  name: "prune-rate-limits",
  cron: { expression: "17 * * * *" },
  async run({ db }) {
    await pruneRateLimits(db);
  },
});
