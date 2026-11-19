// For unit tests only: `t` with every text of a language, like the server's `serverT`.
import { createTranslator, type Locale } from "@postula/i18n";
import { dictionaries, type Messages } from "@postula/i18n/messages";
import type { T } from "../lib/i18n";

export const testT = (locale: Locale = "en"): T =>
  createTranslator<Messages>(locale, dictionaries[locale]);
