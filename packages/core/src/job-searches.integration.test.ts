import {
  createSearchSchema,
  defaultSearchSettings,
  suggestedCompanies,
  updateSearchSchema,
} from "@postula/contracts";
import { createTestDatabase, createTestTenant } from "@postula/db/testing";
import { afterAll, describe, expect, it } from "vitest";
import { DomainError } from "./errors";
import {
  addSearchCompany,
  createSearch,
  deleteSearch,
  getSearch,
  listSearches,
  removeSearchCompany,
  updateSearch,
} from "./job-searches";
import type { TenantContext } from "./tenant";

const connection = createTestDatabase();
afterAll(() => connection.close());
const db = connection.db;

async function tenant(): Promise<TenantContext> {
  const { userId } = await createTestTenant(db);
  return { db, userId };
}

const create = (ctx: TenantContext, input: Parameters<typeof createSearchSchema.parse>[0]) =>
  createSearch(ctx, createSearchSchema.parse(input));

describe("job searches", () => {
  it("starts a new search with the suggested companies and the agreed defaults", async () => {
    const ctx = await tenant();
    const search = await create(ctx, defaultSearchSettings);
    expect(search.name).toBe("Remote, well paid");
    expect(search.criteria.salary).toEqual({
      ideal: 60_000,
      minimum: 50_000,
      currency: "USD",
      required: false,
    });
    expect(search.criteria.remote).toEqual({ value: "remote", required: true });
    expect(search.companies).toHaveLength(suggestedCompanies.length);
    expect(search.companies.every((company) => company.status === "unchecked")).toBe(true);
    const [summary] = await listSearches(ctx);
    expect(summary).toMatchObject({ id: search.id, companyCount: suggestedCompanies.length });
  });

  it("creates a search with only the companies it is given", async () => {
    const ctx = await tenant();
    const search = await create(ctx, {
      name: "Only Linear",
      companies: [{ board: "ashby", token: "Linear" }],
    });
    expect(search.companies).toEqual([
      expect.objectContaining({ board: "ashby", token: "linear", company: "linear" }),
    ]);
  });

  it("edits criteria and settings without touching the companies", async () => {
    const ctx = await tenant();
    const search = await create(ctx, { name: "Draft", companies: [] });
    const updated = await updateSearch(
      ctx,
      updateSearchSchema.parse({
        id: search.id,
        name: "Senior React",
        criteria: { titles: { values: "Senior\nReact", required: true } },
        runAt: "06:30",
        minScore: 80,
        enabled: false,
      }),
    );
    expect(updated).toMatchObject({ name: "Senior React", runAt: "06:30", minScore: 80 });
    expect(updated.enabled).toBe(false);
    expect(updated.criteria.titles).toEqual({ values: ["Senior", "React"], required: true });
    expect(updated.companies).toEqual([]);
  });

  it("adds a company once and removes it", async () => {
    const ctx = await tenant();
    const search = await create(ctx, { name: "Boards", companies: [] });
    const added = await addSearchCompany(ctx, {
      searchId: search.id,
      board: "greenhouse",
      token: "vercel",
      company: "Vercel",
    });
    await addSearchCompany(ctx, { searchId: search.id, board: "greenhouse", token: "vercel" });
    expect((await getSearch(ctx, search.id)).companies).toHaveLength(1);
    await removeSearchCompany(ctx, { searchId: search.id, companyId: added.id });
    expect((await getSearch(ctx, search.id)).companies).toEqual([]);
  });

  it("deletes a search with its companies", async () => {
    const ctx = await tenant();
    const search = await create(ctx, defaultSearchSettings);
    await deleteSearch(ctx, search.id);
    await expect(getSearch(ctx, search.id)).rejects.toThrow(DomainError);
    expect(await listSearches(ctx)).toEqual([]);
  });

  it("never shows or changes another person's search", async () => {
    const owner = await tenant();
    const other = await tenant();
    const search = await create(owner, defaultSearchSettings);
    expect(await listSearches(other)).toEqual([]);
    await expect(getSearch(other, search.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(
      updateSearch(other, updateSearchSchema.parse({ id: search.id, name: "Mine" })),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      addSearchCompany(other, { searchId: search.id, board: "lever", token: "plaid" }),
    ).rejects.toMatchObject({ code: "not_found" });
    const [company] = search.companies;
    await expect(
      removeSearchCompany(other, { searchId: search.id, companyId: company?.id ?? "" }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(deleteSearch(other, search.id)).rejects.toMatchObject({ code: "not_found" });
    expect((await getSearch(owner, search.id)).name).toBe("Remote, well paid");
  });
});
