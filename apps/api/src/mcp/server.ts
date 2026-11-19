import { McpServer, type StandardSchemaWithJSON } from "@modelcontextprotocol/server";
import type { AiCaller, CoreServices, Operation } from "@postula/core";
import { DomainError, InvalidInputError, operations, runOperation } from "@postula/core";
import type { Database } from "@postula/db";
import { z } from "zod/mini";

/** What the AI reads first: how Postula works and the rules it follows with the person. */
export const instructions = [
  "Postula searches job postings every day for the person, scores each one against their master profile, tailors a CV and cover letter for each and applies once they approve.",
  "Every change you make is recorded in the person's audit log with your name.",
  "Before any change, tell the person what you are about to do and wait for their yes. Never invent experience, skills or facts that aren't in their profile.",
  "Tool names are in Spanish; talk to the person in their language.",
].join(" ");

export interface McpServerDeps {
  db: Database;
  services: CoreServices;
}

/**
 * The operation's schema as the SDK takes it: `zod/mini` validates, but only converts to JSON
 * Schema on request, so the converter is added here from the same schema.
 */
export function toolSchema(schema: Operation["input"]): StandardSchemaWithJSON {
  const target = (options: { target: string }) =>
    options.target === "draft-07" ? ("draft-07" as const) : ("draft-2020-12" as const);
  return {
    "~standard": {
      ...schema["~standard"],
      jsonSchema: {
        input: (options) => z.toJSONSchema(schema, { io: "input", target: target(options) }),
        output: (options) => z.toJSONSchema(schema, { io: "output", target: target(options) }),
      },
    },
  };
}

const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
});

const failure = (code: string, message: string) => ({
  ...text({ error: code, message }),
  isError: true,
});

/**
 * One MCP tool per operation of @postula/core, with the same name, schema and audit as the
 * panel. A server per call, for the person behind the token: nothing is kept between calls.
 */
export function createMcpServer(caller: AiCaller, { db, services }: McpServerDeps) {
  const server = new McpServer({ name: "Postula", version: "1.0.0" }, { instructions });
  for (const operation of operations) registerOperation(server, operation, caller, db, services);
  return server;
}

function registerOperation(
  server: McpServer,
  operation: Operation,
  caller: AiCaller,
  db: Database,
  services: CoreServices,
) {
  server.registerTool(
    operation.name,
    {
      title: operation.title,
      description: operation.description,
      inputSchema: toolSchema(operation.input),
      annotations: {
        title: operation.title,
        readOnlyHint: operation.access === "read",
        destructiveHint: operation.destructive,
        idempotentHint: operation.idempotent,
        openWorldHint: false,
      },
    },
    async (input: unknown) => {
      if (operation.access === "write" && !caller.scopes.includes("write")) {
        return failure(
          "write_not_allowed",
          "This connection can only read. The person can reconnect Postula and allow changes.",
        );
      }
      try {
        const result = await runOperation(
          operation,
          {
            tenant: { db, userId: caller.userId },
            services,
            via: "mcp",
            client: caller.clientName,
          },
          input,
        );
        return text(result ?? { ok: true });
      } catch (error) {
        if (error instanceof InvalidInputError) {
          return failure(error.code, JSON.stringify(error.issues));
        }
        if (error instanceof DomainError) return failure(error.code, error.message);
        throw error;
      }
    },
  );
}
