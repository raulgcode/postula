import {
  type AddSearchCompanyInput,
  type CreateSearchInput,
  createSearchSchema,
  type JobBoard,
  type JobSearch,
  type JobSearchSummary,
  SEARCH_COMPANIES_MAX,
  SEARCHES_MAX,
  type SearchCompany,
  type SearchCriteria,
  type SearchMode,
  type SearchSettings,
  suggestedCompanies,
  type UpdateSearchInput,
} from "@postula/contracts";
import { and, asc, count, desc, eq, schema } from "@postula/db";
import { DomainError } from "./errors";
import type { TenantContext } from "./tenant";

type Db = TenantContext["db"];
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const notFound = () => new DomainError("not_found", "The search wasn't found");

function settingsValues(input: SearchSettings, now: Date) {
  return {
    name: input.name,
    criteria: input.criteria,
    runAt: input.runAt,
    timeZone: input.timeZone,
    mode: input.mode,
    minScore: input.minScore,
    dailyLimit: input.dailyLimit,
    enabled: input.enabled,
    updatedAt: now,
  };
}

/** The person's searches, newest first, with how many companies each looks in. */
export async function listSearches(tenant: TenantContext): Promise<JobSearchSummary[]> {
  const rows = await tenant.db
    .select({
      id: schema.jobSearch.id,
      name: schema.jobSearch.name,
      enabled: schema.jobSearch.enabled,
      mode: schema.jobSearch.mode,
      runAt: schema.jobSearch.runAt,
      timeZone: schema.jobSearch.timeZone,
      companyCount: count(schema.jobSearchCompany.id),
    })
    .from(schema.jobSearch)
    .leftJoin(schema.jobSearchCompany, eq(schema.jobSearchCompany.searchId, schema.jobSearch.id))
    .where(eq(schema.jobSearch.userId, tenant.userId))
    .groupBy(schema.jobSearch.id)
    .orderBy(desc(schema.jobSearch.createdAt));
  return rows.map((row) => ({ ...row, mode: row.mode as SearchMode }));
}

/** A search with everything it has, or `not_found` when it isn't the person's. */
export async function getSearch(tenant: TenantContext, id: string): Promise<JobSearch> {
  const [row] = await tenant.db
    .select()
    .from(schema.jobSearch)
    .where(and(eq(schema.jobSearch.id, id), eq(schema.jobSearch.userId, tenant.userId)));
  if (!row) throw notFound();
  const companies = await tenant.db
    .select()
    .from(schema.jobSearchCompany)
    .where(eq(schema.jobSearchCompany.searchId, id))
    .orderBy(asc(schema.jobSearchCompany.company));
  return {
    id: row.id,
    name: row.name,
    criteria: row.criteria as SearchCriteria,
    runAt: row.runAt,
    timeZone: row.timeZone,
    mode: row.mode as SearchMode,
    minScore: row.minScore,
    dailyLimit: row.dailyLimit,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    companies: companies.map(
      (company): SearchCompany => ({
        id: company.id,
        board: company.board as JobBoard,
        token: company.token,
        company: company.company,
        status: company.status as SearchCompany["status"],
        checkedAt: company.checkedAt?.toISOString() ?? null,
      }),
    ),
  };
}

async function ownSearch(db: Db | Tx, userId: string, id: string): Promise<void> {
  const [row] = await db
    .select({ id: schema.jobSearch.id })
    .from(schema.jobSearch)
    .where(and(eq(schema.jobSearch.id, id), eq(schema.jobSearch.userId, userId)));
  if (!row) throw notFound();
}

/** Creates a search; without companies it starts with Postula's suggested list. */
export async function createSearch(
  tenant: TenantContext,
  input: CreateSearchInput,
  now = new Date(),
): Promise<JobSearch> {
  const companies =
    input.companies ??
    createSearchSchema.parse({ name: input.name, companies: [...suggestedCompanies] }).companies ??
    [];
  const id = await tenant.db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ total: count() })
      .from(schema.jobSearch)
      .where(eq(schema.jobSearch.userId, tenant.userId));
    if ((existing?.total ?? 0) >= SEARCHES_MAX) {
      throw new DomainError(
        "too_many_searches",
        `A person can have up to ${SEARCHES_MAX} searches`,
      );
    }
    const [row] = await tx
      .insert(schema.jobSearch)
      .values({ userId: tenant.userId, ...settingsValues(input, now), createdAt: now })
      .returning({ id: schema.jobSearch.id });
    if (!row) throw new Error("The search wasn't saved");
    if (companies.length > 0) {
      await tx
        .insert(schema.jobSearchCompany)
        .values(
          companies.map((company) => ({
            userId: tenant.userId,
            searchId: row.id,
            board: company.board,
            token: company.token,
            company: company.company || company.token,
            createdAt: now,
          })),
        )
        .onConflictDoNothing();
    }
    return row.id;
  });
  return getSearch(tenant, id);
}

/** Changes a search's settings and criteria; its companies stay as they are. */
export async function updateSearch(
  tenant: TenantContext,
  input: UpdateSearchInput,
  now = new Date(),
): Promise<JobSearch> {
  const updated = await tenant.db
    .update(schema.jobSearch)
    .set(settingsValues(input, now))
    .where(and(eq(schema.jobSearch.id, input.id), eq(schema.jobSearch.userId, tenant.userId)))
    .returning({ id: schema.jobSearch.id });
  if (updated.length === 0) throw notFound();
  return getSearch(tenant, input.id);
}

/** Deletes a search and its list of companies. */
export async function deleteSearch(tenant: TenantContext, id: string): Promise<{ deleted: true }> {
  const deleted = await tenant.db
    .delete(schema.jobSearch)
    .where(and(eq(schema.jobSearch.id, id), eq(schema.jobSearch.userId, tenant.userId)))
    .returning({ id: schema.jobSearch.id });
  if (deleted.length === 0) throw notFound();
  return { deleted: true };
}

/** Adds a company's board to a search. Adding one it already has changes nothing. */
export async function addSearchCompany(
  tenant: TenantContext,
  input: AddSearchCompanyInput,
  now = new Date(),
): Promise<SearchCompany> {
  await tenant.db.transaction(async (tx) => {
    await ownSearch(tx, tenant.userId, input.searchId);
    const [existing] = await tx
      .select({ total: count() })
      .from(schema.jobSearchCompany)
      .where(eq(schema.jobSearchCompany.searchId, input.searchId));
    if ((existing?.total ?? 0) >= SEARCH_COMPANIES_MAX) {
      throw new DomainError(
        "too_many_companies",
        `A search looks in up to ${SEARCH_COMPANIES_MAX} companies`,
      );
    }
    await tx
      .insert(schema.jobSearchCompany)
      .values({
        userId: tenant.userId,
        searchId: input.searchId,
        board: input.board,
        token: input.token,
        company: input.company || input.token,
        createdAt: now,
      })
      .onConflictDoNothing();
  });
  const { companies } = await getSearch(tenant, input.searchId);
  const company = companies.find(
    (entry) => entry.board === input.board && entry.token === input.token,
  );
  if (!company) throw new Error("The company wasn't saved");
  return company;
}

/** Takes a company out of a search. */
export async function removeSearchCompany(
  tenant: TenantContext,
  input: { searchId: string; companyId: string },
): Promise<{ removed: true }> {
  const removed = await tenant.db
    .delete(schema.jobSearchCompany)
    .where(
      and(
        eq(schema.jobSearchCompany.id, input.companyId),
        eq(schema.jobSearchCompany.searchId, input.searchId),
        eq(schema.jobSearchCompany.userId, tenant.userId),
      ),
    )
    .returning({ id: schema.jobSearchCompany.id });
  if (removed.length === 0) throw new DomainError("not_found", "The company wasn't found");
  return { removed: true };
}
