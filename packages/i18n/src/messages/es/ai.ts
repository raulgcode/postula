import type { Translation } from "../../translate";
import type { en } from "../en";

export const ai = {
  title: "Conectar una IA",
  consentTitle: "¿Dejas que {client} use tu Postula?",
  consentIntro: "Entraste como <email>{email}</email>. Si lo permites, {client} podrá:",
  consentRead: "Ver tu búsqueda, tu perfil y cómo van tus postulaciones.",
  consentWrite:
    "Hacer cambios por ti, como encender o apagar la búsqueda. Te pregunta antes y cada cambio queda en tu registro de auditoría.",
  consentNever: "Nunca ve tus contraseñas y no puede postular sin tu aprobación.",
  allow: "Permitir",
  deny: "No permitir",
  connecting: "Conectando…",
  unknownClient: "Esta IA",
  consentExpired:
    "Esta solicitud venció o no es válida. Vuelve a tu IA y conecta Postula otra vez.",
} as const satisfies Translation<typeof en>["ai"];
