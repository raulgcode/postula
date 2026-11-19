import { z } from "zod/mini";

/** Where the MCP server answers on the API. */
export const MCP_PATH = "/mcp";

/** The MCP server's address for an API at `apiUrl` (https://api.postula.intensoft.dev). */
export function mcpUrl(apiUrl: string): string {
  return new URL(MCP_PATH, apiUrl).toString();
}

/**
 * Tokens carry a prefix so secret scanners can spot a leaked one, and so the API can tell an
 * AI's access token from anything else before it touches the database.
 */
export const aiTokenPrefixes = { opaqueAccessToken: "pst_at_", refreshToken: "pst_rt_" } as const;

/**
 * What an AI may ask for: `read` sees the person's data, `write` changes it (each change goes to
 * the audit log) and `offline_access` keeps it connected without signing in again.
 */
export const aiConnectionScopes = ["read", "write", "offline_access"] as const;
export type AiConnectionScope = (typeof aiConnectionScopes)[number];

/** The consent page's two buttons. */
export const aiConsentSchema = z.object({ intent: z.enum(["allow", "deny"]) });
export type AiConsentInput = z.infer<typeof aiConsentSchema>;
