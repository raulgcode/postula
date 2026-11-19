import type { TenantContext } from "@postula/core";
import { createDatabase, type Database, eq, schema } from "@postula/db";

/** The e2e database: the one the web server of playwright.config.ts runs against. */
export function connectTestDatabase() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  return createDatabase(url);
}

/** A person of the test database, ready for `@postula/core`'s use cases. */
export interface Account {
  email: string;
  userId: string;
  /** What the panel would pass to core: in Postula each person is their own tenant. */
  tenant: TenantContext;
}

export async function findAccount(db: Database, email: string): Promise<Account> {
  const [row] = await db
    .select({ userId: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email));
  if (!row) throw new Error(`No account for ${email}`);
  return { email, userId: row.userId, tenant: { db, userId: row.userId } };
}
