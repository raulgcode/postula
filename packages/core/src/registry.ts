import {
  addSearchCompanySchema,
  createSearchSchema,
  deleteProfileItemSchema,
  importProfileSchema,
  listAuditSchema,
  listPostingsSchema,
  moveProfileItemSchema,
  postingIdSchema,
  profileHeaderSchema,
  removeSearchCompanySchema,
  runSearchSchema,
  saveProfileItemSchema,
  searchIdSchema,
  type setSearchSchema,
  updateSearchSchema,
} from "@postula/contracts";
import { z } from "zod/mini";
import { listAudit } from "./audit";
import {
  addSearchCompany,
  createSearch,
  deleteSearch,
  getSearch,
  listSearches,
  removeSearchCompany,
  updateSearch,
} from "./job-searches";
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
import { getPosting, listPostings, listSearchRuns, runSearch } from "./search-runs";

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
export const listarBusquedas = defineOperation({
  name: "listar_busquedas",
  title: "List searches",
  description:
    "The person's searches: each one's name, whether it runs, at what hour and time zone, its mode and how many companies it looks in. Use ver_busqueda for one search's criteria and companies.",
  input: noInput,
  access: "read",
  destructive: false,
  idempotent: true,
  run: ({ tenant }) => listSearches(tenant),
});

export const verBusqueda = defineOperation({
  name: "ver_busqueda",
  title: "Show a search",
  description:
    "One search with everything: its criteria (titles, keywords, remote, regions, salary, excluded companies; each criterion is a preference unless `required` is true), schedule, mode, minimum score, daily limit and the companies' job boards it looks in.",
  input: searchIdSchema,
  access: "read",
  destructive: false,
  idempotent: true,
  run: ({ tenant }, input) => getSearch(tenant, input.id),
});

export const crearBusqueda = defineOperation({
  name: "crear_busqueda",
  title: "Create a search",
  description:
    "Creates a search. Criteria are preferences that add or take points, never reasons to discard, unless the person explicitly marks one as `required`; never mark one required on your own. Salary is a year's pay. Leave `companies` out to start with Postula's suggested remote-friendly companies. Show the person what you'll create and ask before calling it.",
  input: createSearchSchema,
  access: "write",
  destructive: false,
  idempotent: false,
  run: ({ tenant, services }, input) => createSearch(tenant, input, services.now?.()),
});

export const editarBusqueda = defineOperation({
  name: "editar_busqueda",
  title: "Edit a search",
  description:
    "Replaces a search's name, criteria, schedule, mode, minimum score, daily limit and whether it runs (call ver_busqueda first and send everything back with your changes). Its companies don't change: use agregar_empresa and quitar_empresa.",
  input: updateSearchSchema,
  access: "write",
  destructive: false,
  idempotent: true,
  run: ({ tenant, services }, input) => updateSearch(tenant, input, services.now?.()),
});

export const borrarBusqueda = defineOperation({
  name: "borrar_busqueda",
  title: "Delete a search",
  description:
    "Deletes a search and its list of companies. Ask the person before calling it; to pause a search instead, set `enabled` to false with editar_busqueda.",
  input: searchIdSchema,
  access: "write",
  destructive: true,
  idempotent: true,
  run: ({ tenant }, input) => deleteSearch(tenant, input.id),
});

export const agregarEmpresa = defineOperation({
  name: "agregar_empresa",
  title: "Add a company to a search",
  description:
    "Adds a company's public job board to a search: the ATS (greenhouse, lever or ashby) and the board name from its address (job-boards.greenhouse.io/<name>, jobs.lever.co/<name>, jobs.ashbyhq.com/<name>). Postula only reads these public boards, never LinkedIn. Adding one the search already has changes nothing.",
  input: addSearchCompanySchema,
  access: "write",
  destructive: false,
  idempotent: true,
  run: ({ tenant, services }, input) => addSearchCompany(tenant, input, services.now?.()),
});

export const quitarEmpresa = defineOperation({
  name: "quitar_empresa",
  title: "Remove a company from a search",
  description:
    "Takes a company's job board out of a search (by the company's id from ver_busqueda).",
  input: removeSearchCompanySchema,
  access: "write",
  destructive: true,
  idempotent: true,
  run: ({ tenant }, input) => removeSearchCompany(tenant, input),
});

export const correrBusqueda = defineOperation({
  name: "correr_busqueda",
  title: "Search now",
  description:
    "Reads every company's public job board of a search now, instead of waiting for its daily hour, and saves the new postings. It answers how many it found, how many are new and which boards failed. Each search runs once at a time.",
  input: runSearchSchema,
  access: "write",
  destructive: false,
  idempotent: false,
  run: ({ tenant, services, via }, input) => runSearch(tenant, services, input.id, { via }),
});

/** The worker's daily run: not an AI tool (the AI has `correr_busqueda`). */
export const correrBusquedaProgramada = defineOperation({
  name: "correr_busqueda_programada",
  title: "Daily search run",
  description: "The worker runs a search at its hour, once a day.",
  input: z.object({ id: z.uuid(), scheduledFor: z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/)) }),
  access: "write",
  destructive: false,
  idempotent: true,
  run: ({ tenant, services, via }, input) =>
    runSearch(tenant, services, input.id, { via, scheduledFor: input.scheduledFor }),
});

export const verOfertas = defineOperation({
  name: "ver_ofertas",
  title: "List a search's postings",
  description:
    "The postings a search found, newest first: title, company, place, remote or not, pay when the board says it, and links. `open` (default) leaves out closed postings and duplicates of a job already listed. Use ver_oferta for one posting's full description.",
  input: listPostingsSchema,
  access: "read",
  destructive: false,
  idempotent: true,
  run: ({ tenant }, input) => listPostings(tenant, input),
});

export const verOferta = defineOperation({
  name: "ver_oferta",
  title: "Show a posting",
  description: "One posting with its full description as the company published it.",
  input: postingIdSchema,
  access: "read",
  destructive: false,
  idempotent: true,
  run: ({ tenant }, input) => getPosting(tenant, input.id),
});

export const verCorridas = defineOperation({
  name: "ver_corridas",
  title: "Show a search's latest runs",
  description:
    "The last five times a search read its boards: when, whether it went well, how many postings it found and added, and which companies' boards failed (not found or not answering).",
  input: runSearchSchema,
  access: "read",
  destructive: false,
  idempotent: true,
  run: ({ tenant }, input) => listSearchRuns(tenant, input.id),
});

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
  listarBusquedas,
  verBusqueda,
  crearBusqueda,
  editarBusqueda,
  borrarBusqueda,
  agregarEmpresa,
  quitarEmpresa,
  correrBusqueda,
  verOfertas,
  verOferta,
  verCorridas,
];
