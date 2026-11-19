import { type SearchStatus, WORKER_BEAT_STALE_MS, type WorkerState } from "@postula/contracts";
import { desc, eq, schema } from "@postula/db";
import { DomainError } from "./errors";
import type { CoreServices } from "./operations";
import type { TenantContext } from "./tenant";

/** Whether anyone has "Búsqueda activa" on: the worker runs while this is true. */
export async function anySearchActive(db: TenantContext["db"]): Promise<boolean> {
  const [row] = await db
    .select({ userId: schema.searchSwitch.userId })
    .from(schema.searchSwitch)
    .where(eq(schema.searchSwitch.active, true))
    .limit(1);
  return Boolean(row);
}

/** The worker's last heartbeat, from any of its machines. */
async function lastWorkerBeat(db: TenantContext["db"]): Promise<Date | null> {
  const [row] = await db
    .select({ beatAt: schema.workerBeat.beatAt })
    .from(schema.workerBeat)
    .orderBy(desc(schema.workerBeat.beatAt))
    .limit(1);
  return row?.beatAt ?? null;
}

/** A recent heartbeat beats whatever Fly says: the worker is answering. */
export function workerStateOf(
  machine: "started" | "stopped" | "unknown",
  lastBeatAt: Date | null,
  now: Date,
): WorkerState {
  if (lastBeatAt && now.getTime() - lastBeatAt.getTime() < WORKER_BEAT_STALE_MS) return "running";
  if (machine === "started") return "starting";
  return machine;
}

export async function getSearchStatus(
  tenant: TenantContext,
  services: CoreServices,
): Promise<SearchStatus> {
  const now = services.now?.() ?? new Date();
  const [row] = await tenant.db
    .select({ active: schema.searchSwitch.active, changedAt: schema.searchSwitch.changedAt })
    .from(schema.searchSwitch)
    .where(eq(schema.searchSwitch.userId, tenant.userId));
  const [machine, lastBeatAt] = await Promise.all([
    services.machines.state().catch(() => "unknown" as const),
    lastWorkerBeat(tenant.db),
  ]);
  return {
    active: row?.active ?? false,
    changedAt: row?.changedAt.toISOString() ?? null,
    worker: {
      state: workerStateOf(machine, lastBeatAt, now),
      lastBeatAt: lastBeatAt?.toISOString() ?? null,
    },
  };
}

/**
 * Turns "Búsqueda activa" on or off. On starts the worker's machine before saving, so the switch
 * never says on while nothing can run; off saves first and stops the machine only when nobody
 * else has it on. The worker also stops itself when it finds everyone off, so a failed stop
 * costs at most a minute.
 */
export async function setSearchActive(
  tenant: TenantContext,
  services: CoreServices,
  active: boolean,
): Promise<SearchStatus> {
  const now = services.now?.() ?? new Date();
  if (active) {
    try {
      await services.machines.start();
    } catch (error) {
      throw new DomainError(
        "worker_unreachable",
        `Couldn't start the worker: ${(error as Error).message}`,
      );
    }
  }
  await tenant.db
    .insert(schema.searchSwitch)
    .values({ userId: tenant.userId, active, changedAt: now })
    .onConflictDoUpdate({
      target: schema.searchSwitch.userId,
      set: { active, changedAt: now },
    });
  if (!active && !(await anySearchActive(tenant.db))) {
    // Best effort: the worker exits on its own within a minute when everyone is off.
    await services.machines.stop().catch(() => undefined);
  }
  return getSearchStatus(tenant, services);
}

/** Writes this worker's heartbeat. */
export async function beatWorker(
  db: TenantContext["db"],
  machine: string,
  startedAt: Date,
  now: Date = new Date(),
): Promise<void> {
  await db
    .insert(schema.workerBeat)
    .values({ machine, startedAt, beatAt: now })
    .onConflictDoUpdate({ target: schema.workerBeat.machine, set: { startedAt, beatAt: now } });
}
