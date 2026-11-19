import {
  type AnyPgColumn,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * The head of the person's master profile: who they are, in one card. One row per person; no
 * row until they fill it in or import a CV.
 */
export const profile = pgTable("profile", {
  userId: uuid()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text().notNull(),
  headline: text().notNull(),
  location: text(),
  links: jsonb().$type<string[]>().notNull().default([]),
  summary: text(),
  /** The language the profile is written in ("en", "es"). */
  locale: text().notNull().default("en"),
  updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

export const profileItemKind = pgEnum("profile_item_kind", [
  "experience",
  "project",
  "achievement",
  "skill_group",
  "education",
  "certification",
  "language",
]);

/**
 * One true fact about the person: a job, a project, an achievement under one of them, a group
 * of skills, a degree, a certification or a language. Its id is what an AI cites when it puts
 * the fact in a CV, so it never changes. `data` follows the kind's schema in
 * `@postula/contracts`.
 */
export const profileItem = pgTable(
  "profile_item",
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: profileItemKind().notNull(),
    /** The job or project an achievement belongs to; deleting it deletes its achievements. */
    parentId: uuid().references((): AnyPgColumn => profileItem.id, { onDelete: "cascade" }),
    /** The order inside its section (or inside its parent). */
    position: integer().notNull(),
    data: jsonb().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("profile_item_user_idx").on(table.userId, table.kind, table.position)],
);

/**
 * A saved copy of the whole profile, made each time it changes. Scores and documents point to
 * the version they were made from, so a later edit never changes what a past CV said.
 */
export const profileVersion = pgTable(
  "profile_version",
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    snapshot: jsonb().notNull(),
    /** SHA-256 of the snapshot: an edit that changes nothing doesn't make a new version. */
    hash: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("profile_version_user_created_idx").on(table.userId, table.createdAt)],
);
