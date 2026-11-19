import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * A search the person set up: what they look for (`criteria`, validated by `@postula/contracts`),
 * the hour Postula looks every day in their time zone, and how far it goes alone.
 */
export const jobSearch = pgTable(
  "job_search",
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text().notNull(),
    criteria: jsonb().notNull(),
    /** "08:00", in `timeZone`. */
    runAt: text().notNull(),
    timeZone: text().notNull(),
    /** "manual" only lists; "semi" prepares and waits for approval. */
    mode: text().notNull(),
    minScore: integer().notNull(),
    dailyLimit: integer().notNull(),
    enabled: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("job_search_user_idx").on(table.userId, table.createdAt)],
);

/** A company's public job board a search looks in: the ATS and the board's name ("token"). */
export const jobSearchCompany = pgTable(
  "job_search_company",
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    searchId: uuid()
      .notNull()
      .references(() => jobSearch.id, { onDelete: "cascade" }),
    board: text({ enum: ["greenhouse", "lever", "ashby"] }).notNull(),
    token: text().notNull(),
    company: text().notNull(),
    /** Whether the board answered the last time it was read: "unchecked", "ok", "not_found". */
    status: text().notNull().default("unchecked"),
    checkedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("job_search_company_board_idx").on(table.searchId, table.board, table.token),
    index("job_search_company_user_idx").on(table.userId),
  ],
);
