import { correrBusquedaProgramada, DomainError, dueSearches, runOperation } from "@postula/core";
import { defineJob } from "./queue";

export interface RunSearchData {
  userId: string;
  searchId: string;
  /** The day in the search's time zone. */
  scheduledFor: string;
}

/**
 * One search's daily run: reads its boards as the person's own `correr_busqueda` does, audited
 * with `via: worker`. The day is unique per search, so a job repeated by pg-boss changes nothing.
 */
export const runSearchJob = defineJob<RunSearchData>({
  name: "run-search",
  async run({ db, log, services }, data) {
    try {
      const run = await runOperation(
        correrBusquedaProgramada,
        { tenant: { db, userId: data.userId }, services, via: "worker" },
        { id: data.searchId, scheduledFor: data.scheduledFor },
      );
      log.info({ searchId: data.searchId, run: run.id, status: run.status }, "Search ran");
    } catch (error) {
      // Deleted meanwhile, or the person runs it by hand right now: nothing to retry.
      if (error instanceof DomainError && ["not_found", "search_running"].includes(error.code)) {
        log.warn({ searchId: data.searchId, code: error.code }, "Search run skipped");
        return;
      }
      throw error;
    }
  },
});

/**
 * Every 5 minutes: queues the searches whose hour came today in their time zone, of people with
 * "Búsqueda activa" on. A search waiting in the queue isn't queued twice.
 */
export const dispatchSearchesJob = defineJob({
  name: "dispatch-searches",
  cron: { expression: "*/5 * * * *" },
  async run({ db, now, send }) {
    for (const due of await dueSearches(db, now())) {
      await send(runSearchJob.name, due, {
        singletonKey: `${due.searchId}:${due.scheduledFor}`,
      });
    }
  },
});
