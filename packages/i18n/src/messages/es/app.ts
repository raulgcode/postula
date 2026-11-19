import type { Translation } from "../../translate";
import type { en } from "../en";

/** /app: el layout del panel y su inicio. */
export const app = {
  navHome: "Inicio",
  navSettings: "Ajustes",
  navLabel: "Menú principal",
  homeTitle: "Inicio",
  homeHeading: "Hola, {name}",
  homeIntro:
    "Aquí vive tu búsqueda de trabajo: lo que Postula encontró, lo que te espera y lo que enviaste.",
  searchTitle: "Búsqueda activa",
  searchOn: "Encendida: Postula busca y te prepara postulaciones todos los días.",
  searchOff: "Apagada: no corre nada y no cuesta nada. Tus datos quedan como están.",
  searchCost: "Mientras está encendida, el worker cuesta unos US$0,25 al día.",
  searchTurnOn: "Encender la búsqueda",
  searchTurnOff: "Apagar la búsqueda",
  searchSaving: "Guardando…",
  workerRunning: "El worker está corriendo.",
  workerStarting: "El worker está arrancando, tarda unos segundos.",
  workerStopped: "El worker está apagado.",
  workerUnknown: "En esta computadora el worker corre con pnpm dev.",
  workerUnreachable:
    "El worker no pudo arrancar, así que la búsqueda sigue apagada. Prueba de nuevo en un minuto.",
} as const satisfies Translation<typeof en>["app"];
