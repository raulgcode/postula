import type { Database } from "@postula/db";
import { PgBoss } from "pg-boss";
import type { Logger } from "../logger";

/**
 * The job queue: pg-boss in its own `pgboss` schema of the same Postgres, no Redis. The web and
 * the API only send jobs; the worker process (src/worker.ts) is the only one that works them, so
 * jobs sent while "Búsqueda activa" is off wait in the queue until it is turned on.
 */
export function createQueue(databaseUrl: string): PgBoss {
  return new PgBoss({ connectionString: databaseUrl, schema: "pgboss" });
}

export interface JobContext {
  db: Database;
  log: Logger;
  now: () => Date;
}

/** A job the worker runs: its queue name, and optionally when it repeats. */
export interface JobDefinition<Data extends object = object> {
  name: string;
  /** A cron expression in `tz` (UTC by default): pg-boss creates the job on schedule. */
  cron?: { expression: string; tz?: string };
  run(ctx: JobContext, data: Data): Promise<void>;
}

export function defineJob<Data extends object>(job: JobDefinition<Data>): JobDefinition<Data> {
  return job;
}
