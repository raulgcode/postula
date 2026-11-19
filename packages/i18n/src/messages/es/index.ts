import type { Translation } from "../../translate";
import type { en } from "../en";
import { ai } from "./ai";
import { app } from "./app";
import { auth } from "./auth";
import { common } from "./common";
import { email } from "./email";
import { forms } from "./forms";
import { home } from "./home";
import { profile } from "./profile";
import { searches } from "./searches";
import { settings } from "./settings";

export const es = {
  ai,
  app,
  auth,
  common,
  email,
  forms,
  home,
  profile,
  searches,
  settings,
} as const satisfies Translation<typeof en>;
