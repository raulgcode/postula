import { createJobBoardReader } from "@postula/boards";
import { createDatabase } from "@postula/db";
import { getServerEnv } from "@postula/env";
import { workerMachinesFromEnv } from "@postula/fly";
import { buildApp } from "./app";

const env = getServerEnv();
const port = Number(process.env.PORT ?? 3001);
const connection = createDatabase(env.DATABASE_URL);

const app = await buildApp({
  db: connection.db,
  appUrl: env.APP_URL,
  apiUrl: env.API_URL,
  services: { machines: workerMachinesFromEnv(env), boards: createJobBoardReader() },
  clientIpHeader: env.CLIENT_IP_HEADER,
  logger: env.NODE_ENV === "development" ? { transport: { target: "pino-pretty" } } : true,
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await app.close();
    await connection.close();
    process.exit(0);
  });
}

await app.listen({ port, host: "0.0.0.0" });
