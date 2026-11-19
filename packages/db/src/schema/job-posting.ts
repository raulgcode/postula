import {
  type AnyPgColumn,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { jobSearch } from "./job-search";

/**
 * A posting Postula found on a public job board for the person. One row per board, board name
 * and posting id, so reading the board again updates it instead of adding it twice; the same
 * job found elsewhere points to the first one with `duplicateOfId`.
 */
export const jobPosting = pgTable(
  "job_posting",
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    board: text({ enum: ["greenhouse", "lever", "ashby"] }).notNull(),
    token: text().notNull(),
    externalId: text().notNull(),
    /** Company, title and place written plainly: what tells two copies of a job apart. */
    fingerprint: text().notNull(),
    title: text().notNull(),
    company: text().notNull(),
    location: text().notNull(),
    workplace: text().notNull(),
    url: text().notNull(),
    applyUrl: text(),
    description: text().notNull(),
    publishedAt: timestamp({ withTimezone: true }),
    salary: jsonb(),
    department: text(),
    employmentType: text(),
    duplicateOfId: uuid().references((): AnyPgColumn => jobPosting.id, { onDelete: "set null" }),
    firstSeenAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    closedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    uniqueIndex("job_posting_board_idx").on(
      table.userId,
      table.board,
      table.token,
      table.externalId,
    ),
    index("job_posting_fingerprint_idx").on(table.userId, table.fingerprint),
  ],
);

/** Which searches found a posting: one posting can match several searches of the person. */
export const searchPosting = pgTable(
  "search_posting",
  {
    searchId: uuid()
      .notNull()
      .references(() => jobSearch.id, { onDelete: "cascade" }),
    postingId: uuid()
      .notNull()
      .references(() => jobPosting.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    foundAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.searchId, table.postingId] }),
    index("search_posting_user_idx").on(table.userId),
  ],
);

/**
 * Each time a search read its boards. The daily run carries the day in the search's time zone
 * (`scheduledFor`), unique per search, so a day never runs twice.
 */
export const searchRun = pgTable(
  "search_run",
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    searchId: uuid()
      .notNull()
      .references(() => jobSearch.id, { onDelete: "cascade" }),
    via: text().notNull(),
    /** "running", "ok", "partial" (some boards failed) or "failed". */
    status: text().notNull().default("running"),
    scheduledFor: text(),
    found: integer().notNull().default(0),
    added: integer().notNull().default(0),
    closed: integer().notNull().default(0),
    errors: jsonb().notNull().default([]),
    startedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    uniqueIndex("search_run_day_idx").on(table.searchId, table.scheduledFor),
    index("search_run_search_idx").on(table.searchId, table.startedAt),
  ],
);
