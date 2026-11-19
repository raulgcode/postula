import { randomUUID } from "node:crypto";
import { and, eq, schema } from "@postula/db";
import { createTestDatabase, createTestTenant } from "@postula/db/testing";
import { afterAll, describe, expect, it } from "vitest";
import { DomainError } from "./errors";
import type { WorkerMachines } from "./machines";
import { runOperation } from "./operations";
import { apagarBusqueda, encenderBusqueda, estadoBusqueda } from "./registry";
import { beatWorker, getSearchStatus, setSearchActive } from "./search";
import type { TenantContext } from "./tenant";

const connection = createTestDatabase();
afterAll(() => connection.close());
const db = connection.db;

function fakeMachines(state: "started" | "stopped" | "unknown" = "stopped") {
  const calls: string[] = [];
  const machines: WorkerMachines & { calls: string[] } = {
    calls,
    async start() {
      calls.push("start");
    },
    async stop() {
      calls.push("stop");
    },
    async state() {
      return state;
    },
  };
  return machines;
}

async function tenant(): Promise<TenantContext> {
  const { userId } = await createTestTenant(db);
  return { db, userId };
}

describe("Búsqueda activa", () => {
  it("starts off for someone new", async () => {
    const status = await getSearchStatus(await tenant(), { machines: fakeMachines() });
    expect(status).toMatchObject({ active: false, changedAt: null });
  });

  it("turning it on starts the worker and saves it on", async () => {
    const machines = fakeMachines();
    const status = await setSearchActive(await tenant(), { machines }, true);

    expect(machines.calls).toEqual(["start"]);
    expect(status.active).toBe(true);
    expect(status.changedAt).not.toBeNull();
  });

  it("doesn't save it on when the worker can't start, and says why", async () => {
    const ctx = await tenant();
    const machines = fakeMachines();
    machines.start = async () => {
      throw new Error("Fly said 503");
    };

    const attempt = setSearchActive(ctx, { machines }, true);

    await expect(attempt).rejects.toBeInstanceOf(DomainError);
    await expect(attempt).rejects.toMatchObject({ code: "worker_unreachable" });
    expect((await getSearchStatus(ctx, { machines })).active).toBe(false);
  });

  it("turning it off keeps the worker running while someone else still has it on", async () => {
    const someoneElse = await tenant();
    await setSearchActive(someoneElse, { machines: fakeMachines() }, true);
    const ctx = await tenant();
    await setSearchActive(ctx, { machines: fakeMachines() }, true);

    const machines = fakeMachines();
    await setSearchActive(ctx, { machines }, false);

    expect(machines.calls).toEqual([]);
    await setSearchActive(someoneElse, { machines: fakeMachines() }, false);
  });

  it("each person's switch is their own", async () => {
    const [mine, theirs] = [await tenant(), await tenant()];
    await setSearchActive(mine, { machines: fakeMachines() }, true);

    expect((await getSearchStatus(theirs, { machines: fakeMachines() })).active).toBe(false);
    await setSearchActive(mine, { machines: fakeMachines() }, false);
  });

  it("says the worker is running when it beat just now", async () => {
    const machine = `test-${randomUUID()}`;
    const now = new Date();
    await beatWorker(db, machine, now, now);

    const status = await getSearchStatus(await tenant(), {
      machines: fakeMachines("stopped"),
      now: () => now,
    });

    expect(status.worker.state).toBe("running");
    await db.delete(schema.workerBeat).where(eq(schema.workerBeat.machine, machine));
  });
});

describe("the switch as operations", () => {
  it("records turning it on and off in the audit log, with where it came from", async () => {
    const ctx = await tenant();
    const services = { machines: fakeMachines() };

    await runOperation(encenderBusqueda, { tenant: ctx, services, via: "web" }, {});
    await runOperation(apagarBusqueda, { tenant: ctx, services, via: "mcp", client: "Claude" }, {});
    await runOperation(estadoBusqueda, { tenant: ctx, services, via: "mcp" }, {});

    const rows = await db
      .select({
        operation: schema.auditLog.operation,
        via: schema.auditLog.via,
        client: schema.auditLog.client,
        outcome: schema.auditLog.outcome,
      })
      .from(schema.auditLog)
      .where(eq(schema.auditLog.userId, ctx.userId))
      .orderBy(schema.auditLog.createdAt);
    expect(rows).toEqual([
      { operation: "encender_busqueda", via: "web", client: null, outcome: "ok" },
      { operation: "apagar_busqueda", via: "mcp", client: "Claude", outcome: "ok" },
    ]);
  });

  it("records a failed change with its reason", async () => {
    const ctx = await tenant();
    const machines = fakeMachines();
    machines.start = async () => {
      throw new Error("down");
    };

    await expect(
      runOperation(encenderBusqueda, { tenant: ctx, services: { machines }, via: "web" }, {}),
    ).rejects.toMatchObject({ code: "worker_unreachable" });

    const [row] = await db
      .select({ outcome: schema.auditLog.outcome })
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.userId, ctx.userId),
          eq(schema.auditLog.operation, "encender_busqueda"),
        ),
      );
    expect(row?.outcome).toBe("worker_unreachable");
  });
});
