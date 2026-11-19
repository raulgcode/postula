import { z } from "zod/mini";

export const auditVias = ["web", "mcp", "api", "worker"] as const;
export type AuditVia = (typeof auditVias)[number];

export const AUDIT_PAGE_MAX = 100;

export const listAuditSchema = z.object({
  /** How many of the latest entries, newest first. */
  limit: z.optional(z.int().check(z.minimum(1), z.maximum(AUDIT_PAGE_MAX))),
});
export type ListAuditInput = z.infer<typeof listAuditSchema>;

export const auditEntrySchema = z.object({
  operation: z.string(),
  via: z.enum(auditVias),
  client: z.nullable(z.string()),
  input: z.unknown(),
  outcome: z.string(),
  createdAt: z.string(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;
