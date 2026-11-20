import { aiConnectionScopes } from "@postula/contracts";
import { hashOAuthToken, listAudit, localWorkerMachines, operations } from "@postula/core";
import { createTestAiConnection, createTestDatabase, createTestTenant } from "@postula/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type App, buildApp } from "../app";

const connection = createTestDatabase();
const db = connection.db;
let app: App;

beforeAll(async () => {
  app = await buildApp({
    db,
    appUrl: "http://localhost:5173",
    apiUrl: "http://localhost:3001",
    services: { machines: localWorkerMachines },
    mcpRateLimit: 5,
  });
});
afterAll(async () => {
  await app.close();
  await connection.close();
});

const connect = async (scopes?: string[]) => {
  const { userId } = await createTestTenant(db);
  const { token } = await createTestAiConnection(db, userId, {
    hashToken: hashOAuthToken,
    scopes,
  });
  return { userId, token };
};

let nextId = 1;
/** One JSON-RPC call as a 2025-era client (Claude, ChatGPT) sends it. */
const rpc = (token: string, method: string, params: Record<string, unknown> = {}) =>
  app.inject({
    method: "POST",
    url: "/mcp",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
    },
    payload: { jsonrpc: "2.0", id: nextId++, method, params },
  });

/** The JSON-RPC answer, whether it came as JSON or as one SSE event (the 2025 stateless way). */
const answer = (response: Awaited<ReturnType<typeof rpc>>) => {
  const body = response.body.trim();
  if (body.startsWith("{")) return JSON.parse(body);
  const data = body.split("\n").find((line) => line.startsWith("data: "));
  return JSON.parse(data?.slice("data: ".length) ?? "null");
};

const callTool = async (token: string, name: string, args: Record<string, unknown> = {}) => {
  const response = await rpc(token, "tools/call", { name, arguments: args });
  expect(response.statusCode).toBe(200);
  const { result } = answer(response);
  const text: string = result.content[0].text;
  return {
    isError: Boolean(result.isError),
    text,
    body: text.startsWith("{") || text.startsWith("[") ? JSON.parse(text) : text,
  };
};

describe("OAuth discovery", () => {
  it("says where to sign in, for the resource and its /mcp path", async () => {
    for (const url of [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/mcp",
    ]) {
      const response = await app.inject({ url });
      expect(response.json()).toEqual({
        resource: "http://localhost:3001/mcp",
        authorization_servers: ["http://localhost:5173/api/auth"],
        scopes_supported: [...aiConnectionScopes],
        bearer_methods_supported: ["header"],
        resource_name: "Postula",
      });
    }
  });

  it("answers a call without a token with 401 and the metadata's address", async () => {
    const response = await app.inject({ method: "POST", url: "/mcp", payload: {} });

    expect(response.statusCode).toBe(401);
    expect(response.headers["www-authenticate"]).toBe(
      'Bearer resource_metadata="http://localhost:3001/.well-known/oauth-protected-resource/mcp"',
    );
  });

  it("marks a token that isn't valid as invalid_token", async () => {
    const response = await rpc("pst_at_not-a-token", "tools/list");

    expect(response.statusCode).toBe(401);
    expect(response.headers["www-authenticate"]).toContain('error="invalid_token"');
  });

  it("has no stream to open or session to end", async () => {
    expect((await app.inject({ method: "GET", url: "/mcp" })).statusCode).toBe(405);
    expect((await app.inject({ method: "DELETE", url: "/mcp" })).statusCode).toBe(405);
  });
});

describe("a body that isn't JSON", () => {
  it("gets JSON-RPC's parse error with a 400, not a server error", async () => {
    const { token } = await connect();

    const response = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      payload: '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"arguments":{\\}}}',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ jsonrpc: "2.0", error: { code: -32700 }, id: null });
  });
});

describe("tools", () => {
  it("serves one tool per operation, with its title and hints", async () => {
    const { token } = await connect();

    const response = await rpc(token, "tools/list");

    const tools = answer(response).result.tools;
    expect(tools.map((tool: { name: string }) => tool.name).sort()).toEqual(
      operations.map((operation) => operation.name).sort(),
    );
    expect(tools.find((tool: { name: string }) => tool.name === "estado_busqueda")).toMatchObject({
      title: "Search status",
      inputSchema: { type: "object" },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    });
    expect(tools.find((tool: { name: string }) => tool.name === "ver_auditoria")).toMatchObject({
      inputSchema: { properties: { limit: { type: "integer" } } },
    });
  });

  it("turns the search on for the person behind the token and audits it with the AI's name", async () => {
    const { userId, token } = await connect();

    const on = await callTool(token, "encender_busqueda");
    const status = await callTool(token, "estado_busqueda");

    expect(on.isError).toBe(false);
    expect(status.body).toMatchObject({ active: true });
    const [entry] = await listAudit({ db, userId }, 5);
    expect(entry).toMatchObject({
      operation: "encender_busqueda",
      via: "mcp",
      client: "Claude",
      outcome: "ok",
    });
  });

  it("doesn't let a connection that only reads change anything", async () => {
    const { userId, token } = await connect(["read"]);

    const result = await callTool(token, "encender_busqueda");

    expect(result).toMatchObject({ isError: true, body: { error: "write_not_allowed" } });
    expect(await listAudit({ db, userId }, 5)).toEqual([]);
  });

  it("answers an input that doesn't fit the schema as a tool error", async () => {
    const { token } = await connect();

    const result = await callTool(token, "ver_auditoria", { limit: 500 });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("limit");
  });

  it("only shows the caller's own audit log", async () => {
    const mine = await connect();
    const theirs = await connect();
    await callTool(theirs.token, "encender_busqueda");

    const result = await callTool(mine.token, "ver_auditoria");

    expect(result.body).toEqual([]);
  });
});

describe("rate limit", () => {
  it("allows a few calls a minute per person, then answers 429", async () => {
    const { token } = await connect();
    for (let call = 0; call < 5; call++) {
      expect((await rpc(token, "tools/list")).statusCode).toBe(200);
    }

    const response = await rpc(token, "tools/list");

    expect(response.statusCode).toBe(429);
    expect(response.headers["retry-after"]).toBeDefined();
  });
});
