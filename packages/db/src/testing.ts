import { randomUUID } from "node:crypto";
import { createDatabase, type Database, type DatabaseConnection } from "./client";
import * as schema from "./schema";

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  return url;
}

export function createTestDatabase(): DatabaseConnection {
  return createDatabase(testDatabaseUrl());
}

export interface TestTenant {
  userId: string;
}

/**
 * Creates a person of their own, so tests never share rows. In Postula each person is their own
 * tenant: every row hangs from `user_id`.
 */
export async function createTestTenant(db: Database): Promise<TestTenant> {
  return { userId: await createTestUser(db) };
}

export async function createTestUser(db: Database, suffix = randomUUID().slice(0, 8)) {
  const [user] = await db
    .insert(schema.user)
    .values({ name: `Owner ${suffix}`, email: `owner-${suffix}@test.postula.intensoft.dev` })
    .returning({ id: schema.user.id });
  if (!user) throw new Error("Failed to create test user");
  return user.id;
}
