import { createHash } from "node:crypto";
import { type AiConnectionScope, aiConnectionScopes, aiTokenPrefixes } from "@postula/contracts";
import { and, type Database, eq, gt, isNull, schema } from "@postula/db";

/**
 * How an AI's token is kept: its SHA-256, so a copy of the database can't call the MCP server.
 * Better Auth stores them with this function (the web passes it to `createAuth`) and the API
 * looks them up with it.
 */
export function hashOAuthToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Who is calling the MCP server: the person, through one AI they allowed. */
export interface AiCaller {
  userId: string;
  /** The AI's OAuth client (`oauth_client.client_id`). */
  clientId: string;
  /** What the AI called itself when it registered ("Claude", "ChatGPT"…), for the audit log. */
  clientName: string | null;
  scopes: AiConnectionScope[];
}

/**
 * The person behind an AI's access token, if the token is in force: not expired, not revoked,
 * and its AI still allowed. Checked in Postgres, so the API needs no call to the web.
 */
export async function authenticateAiToken(
  db: Database,
  token: string,
  now: Date = new Date(),
): Promise<AiCaller | null> {
  if (!token.startsWith(aiTokenPrefixes.opaqueAccessToken)) return null;
  const secret = token.slice(aiTokenPrefixes.opaqueAccessToken.length);
  if (!secret) return null;
  const [found] = await db
    .select({
      userId: schema.oauthAccessToken.userId,
      clientId: schema.oauthAccessToken.clientId,
      clientName: schema.oauthClient.name,
      scopes: schema.oauthAccessToken.scopes,
    })
    .from(schema.oauthAccessToken)
    .innerJoin(
      schema.oauthClient,
      eq(schema.oauthClient.clientId, schema.oauthAccessToken.clientId),
    )
    .where(
      and(
        eq(schema.oauthAccessToken.token, hashOAuthToken(secret)),
        gt(schema.oauthAccessToken.expiresAt, now),
        isNull(schema.oauthAccessToken.revoked),
      ),
    );
  if (!found?.userId) return null;
  // Removing the connection deletes the consent: its tokens stop at once.
  const [consent] = await db
    .select({ id: schema.oauthConsent.id })
    .from(schema.oauthConsent)
    .where(
      and(
        eq(schema.oauthConsent.userId, found.userId),
        eq(schema.oauthConsent.clientId, found.clientId),
      ),
    )
    .limit(1);
  if (!consent) return null;
  return {
    userId: found.userId,
    clientId: found.clientId,
    clientName: found.clientName,
    scopes: found.scopes.filter((scope): scope is AiConnectionScope =>
      (aiConnectionScopes as readonly string[]).includes(scope),
    ),
  };
}
