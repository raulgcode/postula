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

/** The source language. A new namespace is added here and in `es/index.ts`. */
export const en = {
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
} as const;
