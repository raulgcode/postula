import { createMcpHandler } from "@modelcontextprotocol/server";
import { aiConnectionScopes, MCP_PATH, mcpUrl } from "@postula/contracts";
import { type AiCaller, authenticateAiToken, type CoreServices, hitRateLimit } from "@postula/core";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { createMcpServer } from "../mcp/server";

export interface McpRoutesOptions {
  /** This API: the MCP server is `${apiUrl}/mcp`. */
  apiUrl: string;
  /** The web app, where the person signs in: its Better Auth is the authorization server. */
  appUrl: string;
  services: CoreServices;
  /** Calls one person may make per minute, across their AIs. */
  rateLimit?: number;
}

const RATE_WINDOW_MS = 60_000;
const METADATA_PATH = "/.well-known/oauth-protected-resource";

/**
 * Postula's MCP server at POST /mcp (Streamable HTTP, stateless: any machine answers any call).
 * Claude, ChatGPT and the editors connect with OAuth: a call without a valid token gets a 401
 * pointing at this resource's metadata, which names the web app as the place to sign in.
 */
export const mcpRoutes: FastifyPluginAsync<McpRoutesOptions> = async (
  app,
  { apiUrl, appUrl, services, rateLimit = 60 },
) => {
  const resource = mcpUrl(apiUrl);
  const resourceMetadata = new URL(`${METADATA_PATH}${MCP_PATH}`, apiUrl).toString();
  // RFC 9728: the resource, and where its tokens come from.
  const metadata = {
    resource,
    authorization_servers: [new URL("/api/auth", appUrl).toString()],
    scopes_supported: [...aiConnectionScopes],
    bearer_methods_supported: ["header"],
    resource_name: "Postula",
  };
  app.get(METADATA_PATH, { schema: { hide: true } }, () => metadata);
  app.get(`${METADATA_PATH}${MCP_PATH}`, { schema: { hide: true } }, () => metadata);

  // One handler; the factory builds a server for the caller of each request.
  const handler = createMcpHandler(
    ({ authInfo }) =>
      createMcpServer(authInfo?.extra?.caller as AiCaller, { db: app.db, services }),
    {
      legacy: "stateless",
      responseMode: "json",
      onerror: (error) => app.log.warn({ err: error }, "MCP request failed"),
    },
  );
  app.addHook("onClose", () => handler.close());

  const unauthorized = (reply: FastifyReply, invalid: boolean) =>
    reply
      .code(401)
      .header(
        "WWW-Authenticate",
        `Bearer resource_metadata="${resourceMetadata}"${invalid ? ', error="invalid_token"' : ""}`,
      )
      .send({ error: "unauthorized", message: "Connect Postula from your AI with OAuth" });

  async function handle(request: FastifyRequest, reply: FastifyReply) {
    const [scheme, token] = (request.headers.authorization ?? "").split(" ");
    if (scheme !== "Bearer" || !token) return unauthorized(reply, false);
    const caller = await authenticateAiToken(app.db, token);
    if (!caller) return unauthorized(reply, true);

    // Counted in Postgres, so the limit holds however many machines serve the API.
    const calls = await hitRateLimit(app.db, `mcp:user:${caller.userId}`, {
      limit: rateLimit,
      windowMs: RATE_WINDOW_MS,
    });
    if (!calls.allowed) {
      return reply
        .code(429)
        .header("Retry-After", String(calls.retryAfterSeconds))
        .send({ error: "rate_limited", message: `Up to ${rateLimit} calls a minute` });
    }

    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (typeof value === "string") headers.set(name, value);
    }
    const response = await handler.fetch(
      new Request(resource, { method: request.method, headers }),
      {
        parsedBody: request.body,
        authInfo: { token, clientId: caller.clientId, scopes: caller.scopes, extra: { caller } },
      },
    );
    reply.code(response.status);
    response.headers.forEach((value, name) => {
      reply.header(name, value);
    });
    return reply.send(await response.text());
  }

  app.post(MCP_PATH, { schema: { hide: true } }, handle);
  // Stateless: there is no stream to open (GET) nor a session to end (DELETE).
  for (const method of ["GET", "DELETE"] as const) {
    app.route({
      method,
      url: MCP_PATH,
      schema: { hide: true },
      handler: (_request, reply) =>
        reply.code(405).header("Allow", "POST").send({ error: "method_not_allowed" }),
    });
  }
};
