import { hostname } from "node:os";
import { createJobBoardReader } from "@postula/boards";
import { anySearchActive, beatWorker } from "@postula/core";
import { createDatabase } from "@postula/db";
import { getServerEnv } from "@postula/env";
import { workerMachinesFromEnv } from "@postula/fly";
import { jobs } from "./jobs";
import { createQueue, type JobContext } from "./jobs/queue";
import { createLogger } from "./logger";

/**
 * The worker: runs the queue's jobs (searches, matching, documents, sending) on its own Fly
 * machine, which "Búsqueda activa" starts and stops from the panel or the AI. While it runs it
 * beats every 30 s, so the panel knows it's alive, and every minute it checks whether anyone
 * still has the search on: if nobody does it exits, and Fly leaves the machine stopped.
 */
const env = getServerEnv();
const log = createLogger(env.NODE_ENV);
const connection = createDatabase(env.DATABASE_URL);
const db = connection.db;
const queue = createQueue(env.DATABASE_URL);
const machine = process.env.FLY_MACHINE_ID ?? hostname();
const startedAt = new Date();
const ctx: JobContext = {
  db,
  log,
  now: () => new Date(),
  services: { machines: workerMachinesFromEnv(env), boards: createJobBoardReader() },
  async send(name, data, options) {
    await queue.send(name, data, options);
  },
};

queue.on("error", (error) => log.error({ err: error }, "Queue error"));

// On a laptop there's no machine to stop: `pnpm dev` runs the worker next to the API and it
// keeps going, so jobs can be tried without the switch.
const stopsWhenIdle = env.NODE_ENV !== "development";

if (stopsWhenIdle && !(await anySearchActive(db))) {
  log.info({ machine }, "Nobody has the search on: the worker stops");
  await connection.close();
  process.exit(0);
}

await queue.start();
for (const job of jobs) {
  await queue.createQueue(job.name);
  await queue.work(job.name, async ([item]) => {
    if (!item) return;
    await job.run(ctx, (item.data ?? {}) as object);
  });
  if (job.cron) {
    // `missed: "once"`: a schedule that came due while the worker was off runs once on start.
    await queue.schedule(job.name, job.cron.expression, null, {
      tz: job.cron.tz ?? "UTC",
      missed: "once",
    });
  }
}

const beat = () =>
  beatWorker(db, machine, startedAt).catch((error: unknown) =>
    log.error({ err: error }, "Worker heartbeat failed"),
  );
await beat();
const beatTimer = setInterval(beat, 30_000);

async function shutdown(code: number) {
  clearInterval(beatTimer);
  clearInterval(idleTimer);
  await queue.stop({ graceful: true, timeout: 20_000 }).catch(() => undefined);
  await connection.close();
  process.exit(code);
}

const idleTimer = setInterval(async () => {
  try {
    if (stopsWhenIdle && !(await anySearchActive(db))) {
      log.info({ machine }, "Nobody has the search on anymore: the worker stops");
      await shutdown(0);
    }
  } catch (error) {
    log.error({ err: error }, "Worker idle check failed");
  }
}, 60_000);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void shutdown(0));
}

log.info({ machine, jobs: jobs.map((job) => job.name) }, "Worker running");
