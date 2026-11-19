import { z } from "zod/mini";

/**
 * What the worker machine is doing, as the panel and the AI tell it: `running` (it answered in
 * the last minute and a half), `starting` (Fly started it but it hasn't answered yet),
 * `stopped`, or `unknown` (no way to ask Fly, as on a laptop, and no recent heartbeat).
 */
export const workerStates = ["running", "starting", "stopped", "unknown"] as const;
export type WorkerState = (typeof workerStates)[number];

/** A worker that hasn't beaten for this long counts as not running. */
export const WORKER_BEAT_STALE_MS = 90_000;

export const searchStatusSchema = z.object({
  /** "Búsqueda activa": whether the person wants Postula searching for them now. */
  active: z.boolean(),
  /** When they last turned it on or off (ISO 8601), null if never. */
  changedAt: z.nullable(z.string()),
  worker: z.object({
    state: z.enum(workerStates),
    /** The last heartbeat of any worker (ISO 8601), null if none ever. */
    lastBeatAt: z.nullable(z.string()),
  }),
});
export type SearchStatus = z.infer<typeof searchStatusSchema>;

/** The panel's switch: on or off. A form leaves an unchecked box out, so missing means off. */
export const setSearchSchema = z.object({ active: z._default(z.boolean(), false) });
export type SetSearchInput = z.infer<typeof setSearchSchema>;
