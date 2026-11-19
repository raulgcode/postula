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

export interface TestAiConnectionOptions {
  /** How Better Auth keeps tokens: `hashOAuthToken` of @postula/core. */
  hashToken: (token: string) => string;
  scopes?: string[];
  clientName?: string;
  expiresAt?: Date;
  revoked?: Date;
  /** Whether the person's consent is there (removing the connection deletes it). */
  consent?: boolean;
}

/**
 * An AI the person allowed, as Better Auth leaves it after the OAuth dance: its client, the
 * consent and an access token. Returns the token as the AI sends it (`pst_at_…`).
 */
export async function createTestAiConnection(
  db: Database,
  userId: string,
  {
    hashToken,
    scopes = ["read", "write", "offline_access"],
    clientName = "Claude",
    expiresAt = new Date(Date.now() + 60 * 60 * 1000),
    revoked,
    consent = true,
  }: TestAiConnectionOptions,
): Promise<{ token: string; clientId: string }> {
  const clientId = `client-${randomUUID()}`;
  const secret = randomUUID();
  const now = new Date();
  await db.insert(schema.oauthClient).values({
    clientId,
    name: clientName,
    redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
    createdAt: now,
    updatedAt: now,
  });
  if (consent) {
    await db
      .insert(schema.oauthConsent)
      .values({ clientId, userId, scopes, createdAt: now, updatedAt: now });
  }
  await db.insert(schema.oauthAccessToken).values({
    token: hashToken(secret),
    clientId,
    userId,
    scopes,
    expiresAt,
    createdAt: now,
    revoked,
  });
  return { token: `pst_at_${secret}`, clientId };
}
