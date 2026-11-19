import type { AuditVia } from "@postula/contracts";
import { schema } from "@postula/db";
import type { z } from "zod/mini";
import { DomainError } from "./errors";
import type { WorkerMachines } from "./machines";
import type { TenantContext } from "./tenant";

/** What an operation may reach besides the database: injected, so tests fake it. */
export interface CoreServices {
  machines: WorkerMachines;
  now?: () => Date;
}

/** Who runs an operation and from where: the panel, an AI through MCP, the API or the worker. */
export interface OperationContext {
  tenant: TenantContext;
  services: CoreServices;
  via: AuditVia;
  /** The AI's name when `via` is "mcp" ("Claude", "ChatGPT"), for the audit log. */
  client?: string | null;
}

// biome-ignore lint/suspicious/noExplicitAny: the registry holds operations of every shape.
type AnySchema = z.ZodMiniType<any, any>;

/**
 * One use case, written once: the web's actions, the REST API and the MCP server all call it
 * through `runOperation`, so the three can't drift apart. Its `name` is its MCP tool's name.
 */
export interface Operation<Input extends AnySchema = AnySchema, Output = unknown> {
  /** snake_case in Spanish, as the person asked for the AI's tools: `encender_busqueda`. */
  name: string;
  /** A short name for people, in English (MCP `title`). */
  title: string;
  /** For the AI: what it does, when to use it and what to ask the person first. */
  description: string;
  input: Input;
  /** `read` never changes anything; `write` is audited and needs the write scope. */
  access: "read" | "write";
  /** Whether it can't be undone (MCP `destructiveHint`): sending, deleting. */
  destructive: boolean;
  /** Whether running it twice with the same input changes nothing more (MCP `idempotentHint`). */
  idempotent: boolean;
  run(ctx: OperationContext, input: z.infer<Input>): Promise<Output>;
}

export function defineOperation<Input extends AnySchema, Output>(
  operation: Operation<Input, Output>,
): Operation<Input, Output> {
  return operation;
}

/** The input didn't match the operation's schema. */
export class InvalidInputError extends DomainError {
  constructor(readonly issues: unknown) {
    super("invalid_input", "The input doesn't match the operation's schema");
  }
}

/**
 * Validates the input, runs the operation and, if it writes, records it in the audit log with
 * its outcome, whether it worked or failed. The only way the web, the API and MCP run a use case.
 */
export async function runOperation<Input extends AnySchema, Output>(
  operation: Operation<Input, Output>,
  ctx: OperationContext,
  rawInput: unknown,
): Promise<Output> {
  const parsed = operation.input.safeParse(rawInput ?? {});
  if (!parsed.success) throw new InvalidInputError(parsed.error.issues);
  if (operation.access === "read") return operation.run(ctx, parsed.data);

  const audit = (outcome: string) =>
    ctx.tenant.db.insert(schema.auditLog).values({
      userId: ctx.tenant.userId,
      operation: operation.name,
      via: ctx.via,
      client: ctx.client ?? null,
      input: parsed.data ?? {},
      outcome,
    });
  try {
    const result = await operation.run(ctx, parsed.data);
    await audit("ok");
    return result;
  } catch (error) {
    await audit(error instanceof DomainError ? error.code : "error");
    throw error;
  }
}
