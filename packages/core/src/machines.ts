/**
 * The worker's machine as the switch sees it. On Fly.io, `createFlyWorkerMachines` of
 * @postula/fly starts and stops the machines of the worker's process group; on a laptop,
 * `localWorkerMachines` does nothing (you run the worker yourself with `pnpm dev`).
 */
export interface WorkerMachines {
  start(): Promise<void>;
  stop(): Promise<void>;
  /** What Fly says, before looking at the heartbeat: started, stopped or unknown. */
  state(): Promise<"started" | "stopped" | "unknown">;
}

export const localWorkerMachines: WorkerMachines = {
  async start() {},
  async stop() {},
  async state() {
    return "unknown";
  },
};
