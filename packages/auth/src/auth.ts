import { oauthProvider } from "@better-auth/oauth-provider";
import { aiConnectionScopes, aiTokenPrefixes } from "@postula/contracts";
import { type Database, schema } from "@postula/db";
import {
  AccountEmail,
  accountEmailSubject,
  MagicLinkEmail,
  type Mailer,
  magicLinkSubject,
} from "@postula/email";
import type { AuthMethod } from "@postula/env";
import { defaultLocale, parseLocale } from "@postula/i18n";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { createElement } from "react";
import { devSignIn } from "./dev-sign-in";

export type RateLimitStorage = NonNullable<
  NonNullable<BetterAuthOptions["rateLimit"]>["customStorage"]
>;

export interface CreateAuthOptions {
  db: Database;
  mailer: Mailer;
  baseURL: string;
  secret: string;
  /** How people sign in (AUTH_METHODS): only these are switched on. */
  methods: readonly AuthMethod[];
  trustedOrigins?: string[];
  /** Needed when `methods` has "google". */
  google?: { clientId: string; clientSecret: string };
  /** Better Auth's per-IP rate limit. Defaults to on; the e2e server disables it. */
  rateLimit?: boolean;
  /**
   * Where the rate limit counts, shared by every server (`hitRateLimit` of @postula/core);
   * in memory without it, which only holds on a single machine.
   */
  rateLimitStorage?: RateLimitStorage;
  /** The header with the caller's IP, set by the platform's proxy (Fly-Client-IP on Fly.io). */
  clientIpHeader?: string;
  /** Local development only: enables `auth.api.devSignIn` (see dev-sign-in.ts). */
  devSignIn?: boolean;
  /** The AIs (Claude, ChatGPT…) that connect to the MCP server with OAuth. */
  aiConnections: AiConnectionsOptions;
}

export interface AiConnectionsOptions {
  /** The MCP server the tokens are for: `${API_URL}/mcp`. */
  resource: string;
  /**
   * How a token is kept in the database. The API checks tokens straight in Postgres with the
   * same function (`hashOAuthToken` of @postula/core), so a copy of the database can't use them.
   */
  hashToken: (token: string) => string;
}

/** Where Better Auth sends the person to allow an AI. */
export const AI_CONSENT_PAGE = "/oauth/consent";

/**
 * OAuth endpoints we don't use over HTTP: AIs register themselves (/oauth2/register) and the
 * person allows them on the consent page, which calls `auth.api` on the server.
 */
export const disabledOAuthPaths = [
  "/oauth2/create-client",
  "/oauth2/get-client",
  "/oauth2/get-clients",
  "/oauth2/update-client",
  "/oauth2/delete-client",
  "/oauth2/client/rotate-secret",
  "/oauth2/get-consent",
  "/oauth2/get-consents",
  "/oauth2/update-consent",
  "/oauth2/delete-consent",
  "/admin/oauth2/create-client",
  "/admin/oauth2/update-client",
  "/admin/oauth2/resources",
  "/admin/oauth2/resources/:identifier",
  "/admin/oauth2/resources/:identifier/clients/:client_id",
];

export function createAuth({
  db,
  mailer,
  baseURL,
  secret,
  methods,
  trustedOrigins = [],
  google,
  rateLimit = true,
  rateLimitStorage,
  clientIpHeader,
  devSignIn: devSignInEnabled = false,
  aiConnections,
}: CreateAuthOptions) {
  const password = methods.includes("password");
  if (methods.includes("google") && !google) {
    throw new Error("Google sign-in needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET");
  }

  const sendAccountEmail = async (
    kind: "verify" | "reset",
    user: { email: string; name: string; locale?: unknown },
    url: string,
  ) => {
    const locale = parseLocale(user.locale) ?? defaultLocale;
    await mailer.send({
      to: user.email,
      subject: accountEmailSubject(kind, locale),
      react: createElement(AccountEmail, { kind, locale, name: user.name, url }),
    });
  };

  return betterAuth({
    appName: "Postula",
    baseURL,
    secret,
    trustedOrigins: [baseURL, ...trustedOrigins],
    disabledPaths: disabledOAuthPaths,
    rateLimit: { enabled: rateLimit, customStorage: rateLimitStorage },
    database: drizzleAdapter(db, { provider: "pg", schema }),
    user: {
      additionalFields: {
        // The language the person picked, for any device and for their emails. Written by the
        // web's /locale action and at sign-up, from the page's language.
        locale: { type: "string", required: false, input: true },
      },
    },
    // An email proved by Google, a magic link or a confirmation joins the same account.
    account: { accountLinking: { enabled: true, trustedProviders: ["google"] } },
    socialProviders:
      methods.includes("google") && google
        ? { google: { ...google, prompt: "select_account" } }
        : {},
    emailAndPassword: {
      enabled: password,
      // No session before the email is proved: nobody signs up with someone else's address.
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      async sendResetPassword({ user, url }) {
        await sendAccountEmail("reset", user, url);
      },
    },
    emailVerification: password
      ? {
          sendOnSignUp: true,
          sendOnSignIn: true,
          autoSignInAfterVerification: true,
          async sendVerificationEmail({ user, url }) {
            await sendAccountEmail("verify", user, url);
          },
        }
      : undefined,
    advanced: {
      database: { generateId: "uuid" },
      ipAddress: clientIpHeader ? { ipAddressHeaders: [clientIpHeader] } : undefined,
    },
    plugins: [
      magicLink({
        // The plugin always answers on the server; with the method off, the web never calls it.
        disableSignUp: !methods.includes("magic-link"),
        expiresIn: 60 * 5,
        // Only the hash is kept: a copy of the database can't sign anyone in.
        storeToken: "hashed",
        // The sign-in form sends the page's language as metadata, so the email matches it.
        async sendMagicLink({ email, url, metadata }) {
          const locale = parseLocale(metadata?.locale) ?? defaultLocale;
          await mailer.send({
            to: email,
            subject: magicLinkSubject(locale),
            react: createElement(MagicLinkEmail, { url, locale }),
          });
        },
      }),
      devSignIn(devSignInEnabled),
      oauthProvider({
        loginPage: "/login",
        consentPage: AI_CONSENT_PAGE,
        scopes: [...aiConnectionScopes],
        // Opaque tokens, checked by the API in Postgres: no signing keys to share or rotate.
        disableJwtPlugin: true,
        storeTokens: { hash: (token) => aiConnections.hashToken(token) },
        prefix: { ...aiTokenPrefixes },
        // Claude, ChatGPT and the editors register themselves the first time (RFC 7591), with
        // no account of theirs here: what protects the person is the sign-in and the consent.
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        // Editors (Cursor, VS Code) listen on http://127.0.0.1 and often leave the type out.
        clientRegistrationDefaultApplicationType: "infer",
        resources: [{ identifier: aiConnections.resource, name: "Postula MCP" }],
        clientRegistrationDefaultResources: [aiConnections.resource],
        // Reconnect after 90 days without using it, not every month.
        refreshTokenExpiresIn: 90 * 24 * 60 * 60,
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;
