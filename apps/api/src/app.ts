import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import { MCP_PATH } from "@postula/contracts";
import { type CoreServices, DomainError, NotFoundError } from "@postula/core";
import type { Database } from "@postula/db";
import Fastify, { type FastifyServerOptions } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { healthRoutes } from "./routes/health";
import { mcpRoutes } from "./routes/mcp";

export interface BuildAppOptions {
  db: Database;
  appUrl: string;
  /** This API's own address, for the MCP server's OAuth metadata. */
  apiUrl: string;
  /** What core's operations reach besides the database (the worker's machines). */
  services: CoreServices;
  /** MCP calls one person may make per minute. */
  mcpRateLimit?: number;
  /** The header with the caller's IP, set by the platform's proxy (Fly-Client-IP on Fly.io). */
  clientIpHeader?: string;
  logger?: FastifyServerOptions["logger"];
}

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
    clientIpHeader: string;
  }
}

/**
 * The API: Zod validates every request and response and documents it in /openapi.json. Each
 * feature is a plugin in `routes/` that calls the use cases of @postula/core, like the web does.
 */
export async function buildApp({
  db,
  appUrl,
  apiUrl,
  services,
  mcpRateLimit,
  clientIpHeader = "fly-client-ip",
  logger = false,
}: BuildAppOptions) {
  const app = Fastify({ logger }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate("db", db);
  app.decorate("clientIpHeader", clientIpHeader);

  await app.register(helmet);
  await app.register(cors, { origin: [appUrl] });
  await app.register(sensible);
  await app.register(swagger, {
    openapi: { info: { title: "Postula API", version: "1.0.0" } },
    transform: jsonSchemaTransform,
  });

  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.code(400).send({ error: "validation_error", issues: error.validation });
    }
    if (error instanceof NotFoundError) {
      return reply.code(404).send({ error: "not_found", message: error.message });
    }
    if (error instanceof DomainError) {
      return reply.code(409).send({ error: error.code, message: error.message });
    }
    // A body Fastify couldn't read (bad JSON, wrong type, too big) is the caller's mistake.
    const {
      statusCode: status,
      code: errorCode,
      message = "Bad request",
    } = error as {
      statusCode?: number;
      code?: string;
      message?: string;
    };
    if (status && status >= 400 && status < 500) {
      if (request.url.split("?")[0] === MCP_PATH) {
        // JSON-RPC's own answer, so an AI's client can show what went wrong.
        const code = errorCode === "FST_ERR_CTP_INVALID_JSON_BODY" ? -32700 : -32600;
        return reply.code(status).send({
          jsonrpc: "2.0",
          error: {
            code,
            message: code === -32700 ? "Parse error: the body isn't valid JSON" : message,
          },
          id: null,
        });
      }
      return reply.code(status).send({ error: "bad_request", message });
    }
    request.log.error(error);
    return reply.code(500).send({ error: "internal_error" });
  });

  app.get("/openapi.json", { schema: { hide: true } }, () => app.swagger());
  await app.register(healthRoutes);
  await app.register(mcpRoutes, { apiUrl, appUrl, services, rateLimit: mcpRateLimit });

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
