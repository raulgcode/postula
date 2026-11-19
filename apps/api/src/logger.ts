import { pino } from "pino";

/** JSON lines on stdout (Fly collects them); readable lines with pino-pretty in development. */
export function createLogger(nodeEnv: string) {
  return pino(
    nodeEnv === "development" ? { transport: { target: "pino-pretty" } } : { level: "info" },
  );
}

export type Logger = ReturnType<typeof createLogger>;
