import { type BoardPosting, createSearchSchema, listPostingsSchema } from "@postula/contracts";
import { eq, schema } from "@postula/db";
import { createTestDatabase, createTestTenant } from "@postula/db/testing";
import { afterAll, describe, expect, it } from "vitest";
import type { BoardRead, JobBoardReader } from "./boards";
import { createSearch } from "./job-searches";
import { localWorkerMachines } from "./machines";
import type { CoreServices } from "./operations";
import { dueSearches, getPosting, listPostings, listSearchRuns, runSearch } from "./search-runs";
import type { TenantContext } from "./tenant";

const connection = createTestDatabase();
afterAll(() => connection.close());
const db = connection.db;

async function tenant(): Promise<TenantContext> {
  const { userId } = await createTestTenant(db);
  return { db, userId };
}

const posting = (externalId: string, overrides: Partial<BoardPosting> = {}): BoardPosting => ({
  externalId,
  title: `Frontend Engineer ${externalId}`,
  company: "Acme",
  location: "Remote",
  workplace: "remote",
  url: `https://jobs.example.com/${externalId}`,
  applyUrl: null,
  description: "Build accessible React apps.",
  publishedAt: "2026-11-01T12:00:00.000Z",
  salary: null,
  department: "Engineering",
  employmentType: "FullTime",
  ...overrides,
});

/** Boards that answer what each test says, by board name. */
function fakeBoards(reads: Record<string, BoardRead>): JobBoardReader {
  return {
    async read(_board, token) {
      return reads[token] ?? { status: "not_found" };
    },
  };
}

const services = (
  boards: JobBoardReader,
  now = new Date("2026-11-19T14:00:00Z"),
): CoreServices => ({
  machines: localWorkerMachines,
  boards,
  now: () => now,
});

async function searchWith(ctx: TenantContext, tokens: string[]) {
  return createSearch(
    ctx,
    createSearchSchema.parse({
      name: "Test",
      companies: tokens.map((token) => ({ board: "greenhouse", token })),
    }),
  );
}

const open = (ctx: TenantContext, searchId: string) =>
  listPostings(ctx, listPostingsSchema.parse({ searchId }));

describe("running a search", () => {
  it("saves what the boards list and says how many are new", async () => {
    const ctx = await tenant();
    const search = await searchWith(ctx, ["acme", "globex"]);
    const boards = fakeBoards({
      acme: { status: "ok", postings: [posting("1"), posting("2")] },
      globex: { status: "ok", postings: [posting("9", { company: "Globex" })] },
    });
    const run = await runSearch(ctx, services(boards), search.id, { via: "web" });
    expect(run).toMatchObject({ status: "ok", found: 3, added: 3, closed: 0, errors: [] });
    const { total, postings } = await open(ctx, search.id);
    expect(total).toBe(3);
    expect(postings.map((entry) => entry.externalId).sort()).toEqual(["1", "2", "9"]);
    const full = await getPosting(ctx, postings[0]?.id ?? "");
    expect(full.description).toBe("Build accessible React apps.");
    const [company] = await db
      .select()
      .from(schema.jobSearchCompany)
      .where(eq(schema.jobSearchCompany.searchId, search.id));
    expect(company?.status).toBe("ok");
  });

  it("never adds the same posting twice, and closes the ones that left the board", async () => {
    const ctx = await tenant();
    const search = await searchWith(ctx, ["acme"]);
    await runSearch(
      ctx,
      services(fakeBoards({ acme: { status: "ok", postings: [posting("1"), posting("2")] } })),
      search.id,
      { via: "web" },
    );
    const again = await runSearch(
      ctx,
      services(
        fakeBoards({
          acme: { status: "ok", postings: [posting("1", { title: "Frontend Engineer II" })] },
        }),
        new Date("2026-11-20T14:00:00Z"),
      ),
      search.id,
      { via: "web" },
    );
    expect(again).toMatchObject({ found: 1, added: 0, closed: 1 });
    const { postings } = await open(ctx, search.id);
    expect(postings.map((entry) => entry.title)).toEqual(["Frontend Engineer II"]);
    const all = await listPostings(
      ctx,
      listPostingsSchema.parse({ searchId: search.id, status: "all" }),
    );
    expect(all.postings.find((entry) => entry.externalId === "2")?.closedAt).toBe(
      "2026-11-20T14:00:00.000Z",
    );
  });

  it("shows a job found on two boards only once", async () => {
    const ctx = await tenant();
    const search = await searchWith(ctx, ["acme", "acme-careers"]);
    const same = { title: "Senior Frontend Engineer", company: "Acme, Inc.", location: "Remote" };
    const run = await runSearch(
      ctx,
      services(
        fakeBoards({
          acme: { status: "ok", postings: [posting("1", same)] },
          "acme-careers": { status: "ok", postings: [posting("77", { ...same, company: "ACME" })] },
        }),
      ),
      search.id,
      { via: "web" },
    );
    expect(run.added).toBe(2);
    const { total } = await open(ctx, search.id);
    expect(total).toBe(1);
    const all = await listPostings(
      ctx,
      listPostingsSchema.parse({ searchId: search.id, status: "all" }),
    );
    expect(all.postings.filter((entry) => entry.duplicateOfId)).toHaveLength(1);
  });

  it("keeps going when a board fails and says which", async () => {
    const ctx = await tenant();
    const search = await searchWith(ctx, ["acme", "gone", "down"]);
    const run = await runSearch(
      ctx,
      services(
        fakeBoards({
          acme: { status: "ok", postings: [posting("1")] },
          down: { status: "error", message: "timeout" },
        }),
      ),
      search.id,
      { via: "web" },
    );
    expect(run.status).toBe("partial");
    expect(run.errors).toEqual([
      expect.objectContaining({ token: "down", reason: "error" }),
      expect.objectContaining({ token: "gone", reason: "not_found" }),
    ]);
    expect(run.found).toBe(1);
    expect(await listSearchRuns(ctx, search.id)).toHaveLength(1);
  });

  it("runs a day's scheduled run only once", async () => {
    const ctx = await tenant();
    const search = await searchWith(ctx, ["acme"]);
    const boards = fakeBoards({ acme: { status: "ok", postings: [posting("1")] } });
    const first = await runSearch(ctx, services(boards), search.id, {
      via: "worker",
      scheduledFor: "2026-11-19",
    });
    const second = await runSearch(ctx, services(boards), search.id, {
      via: "worker",
      scheduledFor: "2026-11-19",
    });
    expect(second.id).toBe(first.id);
    expect(await listSearchRuns(ctx, search.id)).toHaveLength(1);
  });

  it("never runs or shows another person's search", async () => {
    const owner = await tenant();
    const other = await tenant();
    const search = await searchWith(owner, ["acme"]);
    const boards = fakeBoards({ acme: { status: "ok", postings: [posting("1")] } });
    await runSearch(owner, services(boards), search.id, { via: "web" });
    await expect(
      runSearch(other, services(boards), search.id, { via: "web" }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(open(other, search.id)).rejects.toMatchObject({ code: "not_found" });
    const { postings } = await open(owner, search.id);
    await expect(getPosting(other, postings[0]?.id ?? "")).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(listSearchRuns(other, search.id)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("dueSearches", () => {
  it("lists a search once its hour came in its time zone, only while the search is on", async () => {
    const ctx = await tenant();
    const search = await createSearch(
      ctx,
      createSearchSchema.parse({
        name: "Morning",
        runAt: "08:00",
        timeZone: "America/Costa_Rica",
        companies: [],
      }),
    );
    // 13:59 UTC is 07:59 in Costa Rica; 14:01 UTC is 08:01.
    const before = new Date("2026-11-19T13:59:00Z");
    const after = new Date("2026-11-19T14:01:00Z");
    const mine = async (now: Date) =>
      (await dueSearches(db, now)).filter((due) => due.searchId === search.id);
    expect(await mine(after)).toEqual([]);
    await db.insert(schema.searchSwitch).values({ userId: ctx.userId, active: true });
    expect(await mine(before)).toEqual([]);
    expect(await mine(after)).toEqual([
      { userId: ctx.userId, searchId: search.id, scheduledFor: "2026-11-19" },
    ]);
    await runSearch(ctx, services(fakeBoards({}), after), search.id, {
      via: "worker",
      scheduledFor: "2026-11-19",
    });
    expect(await mine(after)).toEqual([]);
  });
});
