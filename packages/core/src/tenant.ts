import type { Database } from "@postula/db";

/**
 * Every use case receives the tenant explicitly. In Postula the tenant is the person: every
 * table has a `user_id`, every query filters by it, and nothing in core reads another person's
 * rows. Web actions, the REST API and the MCP server all build it from the authenticated user,
 * never from a form field or a tool argument.
 */
export interface TenantContext {
  db: Database;
  userId: string;
}
