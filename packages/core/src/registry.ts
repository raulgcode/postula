import { listAuditSchema, type setSearchSchema } from "@postula/contracts";
import { z } from "zod/mini";
import { listAudit } from "./audit";
import { defineOperation, type Operation } from "./operations";
import { getSearchStatus, setSearchActive } from "./search";

const noInput = z.object({});

export const estadoBusqueda = defineOperation({
  name: "estado_busqueda",
  title: "Search status",
  description:
    'Whether Postula\'s job search is on for the person ("Búsqueda activa") and whether the worker that searches and applies is running, starting or stopped.',
  input: noInput,
  access: "read",
  destructive: false,
  idempotent: true,
  run: ({ tenant, services }) => getSearchStatus(tenant, services),
});

export const encenderBusqueda = defineOperation({
  name: "encender_busqueda",
  title: "Turn the job search on",
  description:
    'Turns "Búsqueda activa" on: starts the worker that runs the person\'s searches every day. It costs money while on (about US$0.25 a day), so only call it when the person asks to start searching.',
  input: noInput,
  access: "write",
  destructive: false,
  idempotent: true,
  run: ({ tenant, services }) => setSearchActive(tenant, services, true),
});

export const apagarBusqueda = defineOperation({
  name: "apagar_busqueda",
  title: "Turn the job search off",
  description:
    'Turns "Búsqueda activa" off: no new searches run and the worker stops when nobody else needs it. Applications already in the queue wait until it is turned on again. Nothing is deleted.',
  input: noInput,
  access: "write",
  destructive: false,
  idempotent: true,
  run: ({ tenant, services }) => setSearchActive(tenant, services, false),
});

/** The panel's switch: one operation for both directions, audited as the one it runs. */
export function searchSwitchOperation(input: z.infer<typeof setSearchSchema>) {
  return input.active ? encenderBusqueda : apagarBusqueda;
}

export const verAuditoria = defineOperation({
  name: "ver_auditoria",
  title: "Audit log",
  description:
    "The latest changes made to the person's data, newest first: what changed, from where (the panel, an AI, the API or the worker), which AI, and whether it worked.",
  input: listAuditSchema,
  access: "read",
  destructive: false,
  idempotent: true,
  run: ({ tenant }, input) => listAudit(tenant, input.limit ?? 20),
});

/**
 * Every operation Postula has. The MCP server serves one tool per entry and a test checks that
 * none is missing, so a new use case reaches the AI the day it ships.
 */
export const operations: readonly Operation[] = [
  estadoBusqueda,
  encenderBusqueda,
  apagarBusqueda,
  verAuditoria,
];
