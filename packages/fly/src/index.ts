import { localWorkerMachines, type WorkerMachines } from "@postula/core";

export interface FlyWorkerMachinesOptions {
  /** The Fly app whose machines run the worker (`postula-api`). */
  app: string;
  /** A token that may start and stop that app's machines (`fly tokens create deploy`). */
  token: string;
  /** The process group of fly.api.toml that runs the worker. */
  processGroup?: string;
  /** Injected in tests. */
  fetch?: typeof globalThis.fetch;
  baseUrl?: string;
}

interface FlyMachine {
  id: string;
  state: string;
  config?: { metadata?: Record<string, string> };
}

/**
 * The "Búsqueda activa" switch on Fly.io: starts and stops the machines of the worker's process
 * group through the Machines API. A stopped machine costs only its disk.
 */
export function createFlyWorkerMachines({
  app,
  token,
  processGroup = "worker",
  fetch = globalThis.fetch,
  baseUrl = "https://api.machines.dev",
}: FlyWorkerMachinesOptions): WorkerMachines {
  // `fly tokens create` gives "FlyV1 fm2_…", sent as is; older tokens go as a Bearer.
  const authorization = token.startsWith("FlyV1 ") ? token : `Bearer ${token}`;

  async function call(path: string, method = "GET"): Promise<unknown> {
    const response = await fetch(`${baseUrl}/v1/apps/${app}${path}`, {
      method,
      headers: { authorization, accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`Fly Machines API ${method} ${path}: ${response.status}`);
    }
    return response.status === 204 ? null : response.json();
  }

  async function workers(): Promise<FlyMachine[]> {
    const machines = (await call("/machines")) as FlyMachine[];
    const found = machines.filter(
      (machine) => machine.config?.metadata?.fly_process_group === processGroup,
    );
    if (found.length === 0) throw new Error(`No "${processGroup}" machine in ${app}`);
    return found;
  }

  return {
    async start() {
      for (const machine of await workers()) {
        if (machine.state !== "started" && machine.state !== "starting") {
          await call(`/machines/${machine.id}/start`, "POST");
        }
      }
    },
    async stop() {
      for (const machine of await workers()) {
        if (machine.state === "started" || machine.state === "starting") {
          await call(`/machines/${machine.id}/stop`, "POST");
        }
      }
    },
    async state() {
      const states = (await workers()).map((machine) => machine.state);
      if (states.some((state) => state === "started" || state === "starting")) return "started";
      return "stopped";
    },
  };
}

/** The switch's machines for this environment: Fly's with a token, none on a laptop. */
export function workerMachinesFromEnv(env: {
  FLY_API_TOKEN?: string;
  WORKER_FLY_APP: string;
  WORKER_PROCESS_GROUP: string;
}): WorkerMachines {
  if (!env.FLY_API_TOKEN) return localWorkerMachines;
  return createFlyWorkerMachines({
    app: env.WORKER_FLY_APP,
    token: env.FLY_API_TOKEN,
    processGroup: env.WORKER_PROCESS_GROUP,
  });
}
