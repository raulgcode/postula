import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * "Búsqueda activa": whether the person wants Postula searching and applying for them now. The
 * worker machine runs while anyone has it on; with everyone off it is stopped and costs nothing.
 * No row means off.
 */
export const searchSwitch = pgTable("search_switch", {
  userId: uuid()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  active: boolean().notNull().default(false),
  changedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

/**
 * The worker's heartbeat: each worker process writes its machine and the time every few seconds,
 * so the panel can say whether it is really running. Not anyone's data.
 */
export const workerBeat = pgTable("worker_beat", {
  machine: text().primaryKey(),
  startedAt: timestamp({ withTimezone: true }).notNull(),
  beatAt: timestamp({ withTimezone: true }).notNull(),
});
