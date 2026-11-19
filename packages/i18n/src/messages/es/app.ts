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
} as const satisfies Translation<typeof en>["app"];
