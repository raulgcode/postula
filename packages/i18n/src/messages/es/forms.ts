import type { Translation } from "../../translate";
import type { en } from "../en";

/**
 * Shared by the forms, including the validation errors: the schemas in `@postula/contracts`
 * return these keys and `FieldErrors` translates them.
 */
export const forms = {
  emailLabel: "Correo electrónico",
  emailPlaceholder: "tu@correo.com",
  continueWithGoogle: "Continuar con Google",
  orWithEmail: "o con tu correo",
  emailRequired: "Escribe tu correo",
  emailInvalid: "Escribe un correo válido",
  passwordRequired: "Escribe tu contraseña",
  passwordTooShort: "Usa al menos 8 caracteres",
  passwordTooLong: "Usa hasta 128 caracteres",
  nameRequired: "Escribe tu nombre",
  nameTooLong: "Tu nombre puede tener hasta 80 caracteres",
  tooManyAttempts: "Demasiados intentos. Espera unos minutos y vuelve a probar.",
  fieldRequired: "Completa este campo",
  fieldTooLong: "Es demasiado largo",
  yearMonthInvalid: "Escribe el año, o el año y el mes: 2024 o 2024-03",
  listRequired: "Agrega al menos uno",
  listTooLong: "Son demasiados: hasta 60",
  jsonInvalid: "Postula no puede leer este perfil. Revisa que sea el JSON completo.",
  jsonInvalidItem:
    "Al elemento “{id}” le falta algo o tiene un campo mal escrito. Corrígelo y vuelve a cargar.",
  numberInvalid: "Escribe un número entero dentro del rango",
  timeInvalid: "Escribe la hora como 08:00",
  timeZoneInvalid: "Elige una zona horaria como America/Costa_Rica",
  boardTokenInvalid:
    "Escribe el nombre del tablero como aparece en su dirección: en minúsculas y sin espacios",
} as const satisfies Translation<typeof en>["forms"];
