import type { Translation } from "../../translate";
import type { en } from "../en";
import { ai } from "./ai";
import { app } from "./app";
import { auth } from "./auth";
import { common } from "./common";
import { email } from "./email";
import { forms } from "./forms";
import { home } from "./home";
import { settings } from "./settings";

export const es = {
  ai,
  app,
  auth,
  common,
  email,
  forms,
  home,
  settings,
} as const satisfies Translation<typeof en>;
