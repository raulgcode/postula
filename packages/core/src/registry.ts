import {
  deleteProfileItemSchema,
  importProfileSchema,
  listAuditSchema,
  moveProfileItemSchema,
  profileHeaderSchema,
  saveProfileItemSchema,
  type setSearchSchema,
} from "@postula/contracts";
import { z } from "zod/mini";
import { listAudit } from "./audit";
import { defineOperation, type Operation } from "./operations";
import {
  deleteProfileItem,
  getProfile,
  importProfile,
  moveProfileItem,
  saveProfileHeader,
  saveProfileItem,
} from "./profile";
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

export const verPerfil = defineOperation({
  name: "ver_perfil",
  title: "Master profile",
  description:
    "The person's master profile: their header (name, headline, location, links, summary, language) and every item (jobs, projects, achievements under a job or project, skill groups, education, certifications, languages), each with its id, in CV order. It is everything true a CV or cover letter may say about them: never add facts that aren't here.",
  input: noInput,
  access: "read",
  destructive: false,
  idempotent: true,
  run: ({ tenant }) => getProfile(tenant),
});

export const editarPerfil = defineOperation({
  name: "editar_perfil",
  title: "Edit the profile header",
  description:
    "Changes the head of the master profile: name, headline, location, links, summary and the language it is written in. Send every field, as it replaces the header. Show the person the new text and wait for their yes.",
  input: profileHeaderSchema,
  access: "write",
  destructive: false,
  idempotent: true,
  run: ({ tenant, services }, input) => saveProfileHeader(tenant, input, services.now?.()),
});

export const guardarItemPerfil = defineOperation({
  name: "guardar_item_perfil",
  title: "Add or change a profile item",
  description:
    "Adds an item to the master profile (without `id`) at the end of its section, or changes one (with its `id` from ver_perfil). An achievement needs `parentId`, the job or project it belongs to. Only write what the person told you is true; show them the item and wait for their yes.",
  input: saveProfileItemSchema,
  access: "write",
  destructive: false,
  idempotent: false,
  run: ({ tenant, services }, input) => saveProfileItem(tenant, input, services.now?.()),
});

export const borrarItemPerfil = defineOperation({
  name: "borrar_item_perfil",
  title: "Delete a profile item",
  description:
    "Deletes an item of the master profile; deleting a job or project deletes its achievements too. CVs already made keep what they said. Ask the person before deleting.",
  input: deleteProfileItemSchema,
  access: "write",
  destructive: true,
  idempotent: true,
  run: ({ tenant }, input) => deleteProfileItem(tenant, input.id),
});

export const moverItemPerfil = defineOperation({
  name: "mover_item_perfil",
  title: "Move a profile item",
  description:
    "Moves an item of the master profile one place up or down inside its section (or inside its job or project, for an achievement). The base CV follows this order.",
  input: moveProfileItemSchema,
  access: "write",
  destructive: false,
  idempotent: false,
  run: ({ tenant }, input) => moveProfileItem(tenant, input),
});

export const importarPerfil = defineOperation({
  name: "importar_perfil",
  title: "Replace the whole profile",
  description:
    "Replaces the whole master profile with a new one: the header and every item, each with an id of your own that achievements point to with `parentId`. Use it to load a CV the person gave you, copying its facts as they are, without adding anything. Everything the profile had is replaced, so show the person what you'll load and wait for their yes.",
  input: importProfileSchema,
  access: "write",
  destructive: true,
  idempotent: true,
  run: ({ tenant, services }, input) => importProfile(tenant, input, services.now?.()),
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
  verPerfil,
  editarPerfil,
  guardarItemPerfil,
  borrarItemPerfil,
  moverItemPerfil,
  importarPerfil,
];
