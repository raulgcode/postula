import {
  type BoardPosting,
  type JobBoard,
  type JobPosting,
  type JobPostingSummary,
  type ListPostingsInput,
  POSTING_DESCRIPTION_MAX,
  type PostingSalary,
  postingFingerprint,
  type SearchCriteria,
  type SearchRun,
  setAsideReasonsOf,
  type Workplace,
} from "@postula/contracts";
import { and, asc, desc, eq, inArray, isNull, notInArray, schema, sql } from "@postula/db";
import type { BoardRead } from "./boards";
import { DomainError } from "./errors";
import type { CoreServices } from "./operations";
import type { TenantContext } from "./tenant";

type Db = TenantContext["db"];

/** How many boards a run reads at once: polite to each ATS and quick enough for 200 companies. */
const BOARDS_AT_ONCE = 4;
/** A run that started this long ago and never finished (the machine stopped) no longer blocks. */
const RUN_STALE_MS = 15 * 60_000;
const SAVE_BATCH = 100;

const notFound = () => new DomainError("not_found", "The search wasn't found");

function runOf(row: typeof schema.searchRun.$inferSelect): SearchRun {
  return {
    id: row.id,
    searchId: row.searchId,
    via: row.via,
    status: row.status as SearchRun["status"],
    scheduledFor: row.scheduledFor,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    found: row.found,
    added: row.added,
    closed: row.closed,
    errors: row.errors as SearchRun["errors"],
  };
}

function summaryOf(
  row: typeof schema.jobPosting.$inferSelect,
): Omit<JobPostingSummary, "setAsideReasons"> {
  return {
    id: row.id,
    board: row.board as JobBoard,
    token: row.token,
    externalId: row.externalId,
    title: row.title,
    company: row.company,
    location: row.location,
    workplace: row.workplace as Workplace,
    url: row.url,
    applyUrl: row.applyUrl,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    salary: (row.salary as PostingSalary | null) ?? null,
    department: row.department,
    employmentType: row.employmentType,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    duplicateOfId: row.duplicateOfId,
  };
}

async function searchCompanies(tenant: TenantContext, searchId: string) {
  const [search] = await tenant.db
    .select({ id: schema.jobSearch.id })
    .from(schema.jobSearch)
    .where(and(eq(schema.jobSearch.id, searchId), eq(schema.jobSearch.userId, tenant.userId)));
  if (!search) throw notFound();
  return tenant.db
    .select()
    .from(schema.jobSearchCompany)
    .where(eq(schema.jobSearchCompany.searchId, searchId))
    .orderBy(asc(schema.jobSearchCompany.company));
}

async function mapLimit<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

function cleanPosting(posting: BoardPosting) {
  return {
    ...posting,
    title: posting.title.slice(0, 300),
    company: posting.company.slice(0, 200),
    location: posting.location.slice(0, 300),
    description: posting.description.slice(0, POSTING_DESCRIPTION_MAX),
  };
}

/**
 * Saves what one board listed: new postings are added, known ones refreshed (and reopened if
 * they came back), the ones that left the board are closed.
 */
async function saveBoard(
  db: Db,
  userId: string,
  searchId: string,
  board: JobBoard,
  token: string,
  postings: BoardPosting[],
  now: Date,
) {
  // The same id twice in one listing is one posting.
  const unique = [...new Map(postings.map((posting) => [posting.externalId, posting])).values()];
  let added = 0;
  return db.transaction(async (tx) => {
    const insertedIds: string[] = [];
    for (let start = 0; start < unique.length; start += SAVE_BATCH) {
      const batch = unique.slice(start, start + SAVE_BATCH).map(cleanPosting);
      const rows = await tx
        .insert(schema.jobPosting)
        .values(
          batch.map((posting) => ({
            userId,
            board,
            token,
            externalId: posting.externalId,
            fingerprint: postingFingerprint(posting),
            title: posting.title,
            company: posting.company,
            location: posting.location,
            workplace: posting.workplace,
            url: posting.url,
            applyUrl: posting.applyUrl,
            description: posting.description,
            publishedAt: posting.publishedAt ? new Date(posting.publishedAt) : null,
            salary: posting.salary,
            department: posting.department,
            employmentType: posting.employmentType,
            firstSeenAt: now,
            lastSeenAt: now,
          })),
        )
        .onConflictDoUpdate({
          target: [
            schema.jobPosting.userId,
            schema.jobPosting.board,
            schema.jobPosting.token,
            schema.jobPosting.externalId,
          ],
          set: {
            title: sql`excluded.title`,
            company: sql`excluded.company`,
            location: sql`excluded.location`,
            workplace: sql`excluded.workplace`,
            url: sql`excluded.url`,
            applyUrl: sql`excluded.apply_url`,
            description: sql`excluded.description`,
            publishedAt: sql`excluded.published_at`,
            salary: sql`excluded.salary`,
            department: sql`excluded.department`,
            employmentType: sql`excluded.employment_type`,
            lastSeenAt: now,
            closedAt: null,
          },
        })
        .returning({
          id: schema.jobPosting.id,
          // Postgres's way to tell an insert from an update in one upsert.
          inserted: sql<boolean>`(xmax = 0)`,
        });
      for (const row of rows) if (row.inserted) insertedIds.push(row.id);
      if (rows.length) {
        await tx
          .insert(schema.searchPosting)
          .values(rows.map((row) => ({ searchId, postingId: row.id, userId, foundAt: now })))
          .onConflictDoNothing();
      }
    }
    added = insertedIds.length;
    const stillListed = unique.map((posting) => posting.externalId);
    const closed = await tx
      .update(schema.jobPosting)
      .set({ closedAt: now })
      .where(
        and(
          eq(schema.jobPosting.userId, userId),
          eq(schema.jobPosting.board, board),
          eq(schema.jobPosting.token, token),
          isNull(schema.jobPosting.closedAt),
          stillListed.length ? notInArray(schema.jobPosting.externalId, stillListed) : undefined,
        ),
      )
      .returning({ id: schema.jobPosting.id });
    return { found: unique.length, added, closed: closed.length, insertedIds };
  });
}

/**
 * Each new posting that is the same job as one found before (or earlier in the same run), on
 * any board, points to that first one. After every board is saved, so two boards read at the
 * same time still see each other. Boards of one run share its start time, so the tie goes to
 * the board, then its name: the same copy is listed every time.
 */
async function markDuplicates(db: Db, insertedIds: string[]) {
  if (insertedIds.length === 0) return;
  await db.execute(sql`
    update job_posting p set duplicate_of_id = (
      select o.id from job_posting o
      where o.user_id = p.user_id and o.fingerprint = p.fingerprint
        and o.duplicate_of_id is null
        and (o.first_seen_at, o.board, o.token, o.external_id)
          < (p.first_seen_at, p.board, p.token, p.external_id)
      order by o.first_seen_at, o.board, o.token, o.external_id
      limit 1
    )
    where p.id in (${sql.join(
      insertedIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})`);
}

export interface RunSearchOptions {
  via: string;
  /** The day in the search's time zone, for the daily run: that day runs only once. */
  scheduledFor?: string;
}

/**
 * Reads every board of a search, saves what they list and tells how it went. One board failing
 * doesn't stop the others: the run is `partial` and says which one and why.
 */
export async function runSearch(
  tenant: TenantContext,
  services: CoreServices,
  searchId: string,
  options: RunSearchOptions,
): Promise<SearchRun> {
  const boards = services.boards;
  if (!boards) throw new Error("Running a search needs a job board reader (services.boards)");
  const now = () => services.now?.() ?? new Date();
  const companies = await searchCompanies(tenant, searchId);

  const [running] = await tenant.db
    .select({ id: schema.searchRun.id })
    .from(schema.searchRun)
    .where(
      and(
        eq(schema.searchRun.searchId, searchId),
        eq(schema.searchRun.status, "running"),
        sql`${schema.searchRun.startedAt} > ${new Date(now().getTime() - RUN_STALE_MS)}`,
      ),
    );
  if (running) throw new DomainError("search_running", "The search is already running");

  const [run] = await tenant.db
    .insert(schema.searchRun)
    .values({
      userId: tenant.userId,
      searchId,
      via: options.via,
      scheduledFor: options.scheduledFor ?? null,
      startedAt: now(),
    })
    .onConflictDoNothing()
    .returning();
  if (!run) {
    // That day's run already happened (or is happening): nothing to do twice.
    const [existing] = await tenant.db
      .select()
      .from(schema.searchRun)
      .where(
        and(
          eq(schema.searchRun.searchId, searchId),
          eq(schema.searchRun.scheduledFor, options.scheduledFor ?? ""),
        ),
      );
    if (!existing) throw new Error("The search run wasn't saved");
    return runOf(existing);
  }

  const totals = { found: 0, added: 0, closed: 0 };
  const insertedIds: string[] = [];
  const errors: SearchRun["errors"] = [];
  await mapLimit(companies, BOARDS_AT_ONCE, async (company) => {
    const board = company.board as JobBoard;
    const read: BoardRead = await boards
      .read(board, company.token, company.company)
      .catch((error: unknown) => ({
        status: "error" as const,
        message: error instanceof Error ? error.message : String(error),
      }));
    await tenant.db
      .update(schema.jobSearchCompany)
      .set({ status: read.status, checkedAt: now() })
      .where(eq(schema.jobSearchCompany.id, company.id));
    if (read.status !== "ok") {
      errors.push({ board, token: company.token, company: company.company, reason: read.status });
      return;
    }
    const saved = await saveBoard(
      tenant.db,
      tenant.userId,
      searchId,
      board,
      company.token,
      read.postings,
      run.startedAt,
    );
    totals.found += saved.found;
    totals.added += saved.added;
    totals.closed += saved.closed;
    insertedIds.push(...saved.insertedIds);
  });
  await markDuplicates(tenant.db, insertedIds);

  errors.sort((a, b) => a.company.localeCompare(b.company));
  const status =
    errors.length === 0 ? "ok" : errors.length < companies.length ? "partial" : "failed";
  const [finished] = await tenant.db
    .update(schema.searchRun)
    .set({ ...totals, errors, status, finishedAt: now() })
    .where(eq(schema.searchRun.id, run.id))
    .returning();
  if (!finished) throw new Error("The search run wasn't saved");
  return runOf(finished);
}

/**
 * A search's postings, newest first. By default the open ones that meet what the search
 * requires (remote, the place, …), without duplicates; `set_aside` lists the others with their
 * reasons. Reasons are worked out with today's criteria, so changing them changes the lists.
 */
export async function listPostings(
  tenant: TenantContext,
  input: ListPostingsInput,
): Promise<{ total: number; open: number; setAside: number; postings: JobPostingSummary[] }> {
  const [search] = await tenant.db
    .select({ criteria: schema.jobSearch.criteria })
    .from(schema.jobSearch)
    .where(
      and(eq(schema.jobSearch.id, input.searchId), eq(schema.jobSearch.userId, tenant.userId)),
    );
  if (!search) throw notFound();
  const criteria = search.criteria as SearchCriteria;
  const rows = await tenant.db
    .select({ posting: schema.jobPosting })
    .from(schema.searchPosting)
    .innerJoin(schema.jobPosting, eq(schema.jobPosting.id, schema.searchPosting.postingId))
    .where(
      and(
        eq(schema.searchPosting.searchId, input.searchId),
        eq(schema.searchPosting.userId, tenant.userId),
      ),
    )
    .orderBy(
      desc(sql`coalesce(${schema.jobPosting.publishedAt}, ${schema.jobPosting.firstSeenAt})`),
      asc(schema.jobPosting.id),
    );
  const all = rows.map(({ posting }) => ({
    ...summaryOf(posting),
    setAsideReasons: setAsideReasonsOf(
      posting as Parameters<typeof setAsideReasonsOf>[0],
      criteria,
    ),
  }));
  const current = all.filter((posting) => !posting.closedAt && !posting.duplicateOfId);
  const open = current.filter((posting) => posting.setAsideReasons.length === 0);
  const setAside = current.filter((posting) => posting.setAsideReasons.length > 0);
  const listed = { open, set_aside: setAside, all }[input.status];
  return {
    total: listed.length,
    open: open.length,
    setAside: setAside.length,
    postings: listed.slice(input.offset, input.offset + input.limit),
  };
}

/** One posting with its full description, or `not_found` when it isn't the person's. */
export async function getPosting(tenant: TenantContext, id: string): Promise<JobPosting> {
  const [row] = await tenant.db
    .select()
    .from(schema.jobPosting)
    .where(and(eq(schema.jobPosting.id, id), eq(schema.jobPosting.userId, tenant.userId)));
  if (!row) throw new DomainError("not_found", "The posting wasn't found");
  return { ...summaryOf(row), description: row.description };
}

/** A search's latest runs, newest first. */
export async function listSearchRuns(
  tenant: TenantContext,
  searchId: string,
  limit = 5,
): Promise<SearchRun[]> {
  await searchCompanies(tenant, searchId);
  const rows = await tenant.db
    .select()
    .from(schema.searchRun)
    .where(and(eq(schema.searchRun.searchId, searchId), eq(schema.searchRun.userId, tenant.userId)))
    .orderBy(desc(schema.searchRun.startedAt))
    .limit(limit);
  return rows.map(runOf);
}

/** The day ("2026-11-19") and the time ("08:05") it is now in a time zone. */
export function localDayAndTime(timeZone: string, now: Date): { day: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

export interface DueSearch {
  userId: string;
  searchId: string;
  scheduledFor: string;
}

/**
 * The searches whose hour came today in their time zone and haven't run today, of people with
 * "Búsqueda activa" on. The only read across people: the worker's, to know whom to run.
 */
export async function dueSearches(db: Db, now: Date): Promise<DueSearch[]> {
  const searches = await db
    .select({
      userId: schema.jobSearch.userId,
      searchId: schema.jobSearch.id,
      runAt: schema.jobSearch.runAt,
      timeZone: schema.jobSearch.timeZone,
    })
    .from(schema.jobSearch)
    .innerJoin(schema.searchSwitch, eq(schema.searchSwitch.userId, schema.jobSearch.userId))
    .where(and(eq(schema.jobSearch.enabled, true), eq(schema.searchSwitch.active, true)));
  const due = searches.flatMap((search) => {
    const { day, time } = localDayAndTime(search.timeZone, now);
    return time >= search.runAt
      ? [{ userId: search.userId, searchId: search.searchId, scheduledFor: day }]
      : [];
  });
  if (due.length === 0) return [];
  const ran = await db
    .select({ searchId: schema.searchRun.searchId, scheduledFor: schema.searchRun.scheduledFor })
    .from(schema.searchRun)
    .where(
      inArray(
        schema.searchRun.searchId,
        due.map((search) => search.searchId),
      ),
    );
  const done = new Set(ran.map((run) => `${run.searchId}|${run.scheduledFor}`));
  return due.filter((search) => !done.has(`${search.searchId}|${search.scheduledFor}`));
}
