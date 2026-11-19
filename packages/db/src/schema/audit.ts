import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * Every change anyone (the person, their AI, the worker) makes to a person's data: one row per
 * operation that writes, written by `runOperation` of @postula/core. Never updated or deleted.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** The operation's name, the same one its MCP tool has (`encender_busqueda`). */
    operation: text().notNull(),
    /** Where it came from: the panel, an AI through MCP, the REST API or the worker. */
    via: text({ enum: ["web", "mcp", "api", "worker"] }).notNull(),
    /** The AI that called it, when it came through MCP ("Claude", "ChatGPT"). */
    client: text(),
    input: jsonb().notNull(),
    /** "ok", or the error code when it failed. */
    outcome: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("audit_log_user_created_idx").on(table.userId, table.createdAt)],
);
