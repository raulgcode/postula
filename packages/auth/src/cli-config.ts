// Entry point for the Better Auth CLI (`pnpm auth:generate`), which reads `auth` to generate the
// Drizzle schema in packages/db/src/schema/auth.ts. Every method is on, so the schema has all
// their tables and columns whatever AUTH_METHODS says.
import { createHash } from "node:crypto";
import { mcpUrl } from "@postula/contracts";
import { createDatabase } from "@postula/db";
import { createMailer } from "@postula/email";
import { authMethods, getServerEnv } from "@postula/env";
import { createAuth } from "./auth";

const env = getServerEnv();

export const auth = createAuth({
  db: createDatabase(env.DATABASE_URL).db,
  mailer: createMailer(env),
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  methods: authMethods,
  google: { clientId: "schema", clientSecret: "schema" },
  aiConnections: {
    resource: mcpUrl(env.API_URL),
    hashToken: (token) => createHash("sha256").update(token).digest("hex"),
  },
});
