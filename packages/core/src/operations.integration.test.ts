import { eq, schema } from "@postula/db";
import { createTestDatabase, createTestTenant } from "@postula/db/testing";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod/mini";
import { localWorkerMachines } from "./machines";
import { defineOperation, InvalidInputError, runOperation } from "./operations";
import { operations, verAuditoria } from "./registry";

const connection = createTestDatabase();
afterAll(() => connection.close());
const db = connection.db;
const services = { machines: localWorkerMachines };

const echo = defineOperation({
  name: "probar_eco",
  title: "Echo",
  description: "Test only.",
  input: z.object({ text: z.string() }),
  access: "write",
  destructive: false,
  idempotent: true,
  run: async (_ctx, input) => input.text,
});

describe("runOperation", () => {
  it("refuses an input that doesn't match the schema, before running anything", async () => {
    const { userId } = await createTestTenant(db);

    await expect(
      runOperation(echo, { tenant: { db, userId }, services, via: "api" }, { text: 3 }),
    ).rejects.toBeInstanceOf(InvalidInputError);

    const rows = await db.select().from(schema.auditLog).where(eq(schema.auditLog.userId, userId));
    expect(rows).toEqual([]);
  });

  it("audits a write with its input", async () => {
    const { userId } = await createTestTenant(db);

    const result = await runOperation(
      echo,
      { tenant: { db, userId }, services, via: "api" },
      { text: "hola" },
    );

    expect(result).toBe("hola");
    const entries = await runOperation(
      verAuditoria,
      { tenant: { db, userId }, services, via: "web" },
      {},
    );
    expect(entries).toMatchObject([
      { operation: "probar_eco", via: "api", input: { text: "hola" }, outcome: "ok" },
    ]);
  });

  it("only shows each person their own audit log", async () => {
    const mine = await createTestTenant(db);
    const theirs = await createTestTenant(db);
    await runOperation(
      echo,
      { tenant: { db, userId: theirs.userId }, services, via: "api" },
      {
        text: "x",
      },
    );

    const entries = await runOperation(
      verAuditoria,
      { tenant: { db, userId: mine.userId }, services, via: "web" },
      {},
    );
    expect(entries).toEqual([]);
  });
});

describe("the registry", () => {
  it("names every operation once, in snake_case, with a description for the AI", () => {
    const names = operations.map((operation) => operation.name);
    expect(new Set(names).size).toBe(names.length);
    for (const operation of operations) {
      expect(operation.name).toMatch(/^[a-z]+(_[a-z]+)*$/);
      expect(operation.description.length).toBeGreaterThan(40);
    }
  });
});
