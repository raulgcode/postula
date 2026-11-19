import type { AuditEntry, AuditVia } from "@postula/contracts";
import { desc, eq, schema } from "@postula/db";
import type { TenantContext } from "./tenant";

/** The person's latest audit entries, newest first. */
export async function listAudit(tenant: TenantContext, limit = 20): Promise<AuditEntry[]> {
  const rows = await tenant.db
    .select({
      operation: schema.auditLog.operation,
      via: schema.auditLog.via,
      client: schema.auditLog.client,
      input: schema.auditLog.input,
      outcome: schema.auditLog.outcome,
      createdAt: schema.auditLog.createdAt,
    })
    .from(schema.auditLog)
    .where(eq(schema.auditLog.userId, tenant.userId))
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    ...row,
    via: row.via as AuditVia,
    createdAt: row.createdAt.toISOString(),
  }));
}
