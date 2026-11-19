import { createHash, randomBytes } from "node:crypto";
import type { APIRequestContext, Page, PlaywrightWorkerArgs } from "@playwright/test";
import { mcpUrl } from "@postula/contracts";
import { authenticateAiToken } from "@postula/core";
import { expect, ownerTest, test } from "../support/fixtures";
import { getLinkFromEmail, uniqueEmail } from "../support/mailpit";

// Where the AI listens for the answer: nothing runs there, the browser's request is caught.
const redirectUri = "http://127.0.0.1:43123/callback";
const resource = mcpUrl(process.env.API_URL ?? "http://localhost:3001");

/** What Claude or ChatGPT do the first time: register themselves (RFC 7591). */
async function registerAi(request: APIRequestContext, name: string) {
  const response = await request.post("/api/auth/oauth2/register", {
    data: {
      client_name: name,
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()).client_id as string;
}

/** Sends the person to authorize the AI with PKCE, as the AI's browser window would. */
async function startConnecting(page: Page, clientId: string) {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const query = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "read write offline_access",
    state: "e2e-state",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource,
  });
  let callback: URL | undefined;
  await page.route(`${redirectUri}**`, (route) => {
    callback = new URL(route.request().url());
    return route.fulfill({ body: "Connected", contentType: "text/plain" });
  });
  await page.goto(`/api/auth/oauth2/authorize?${query}`);
  return { verifier, callback: () => callback };
}

// The AI talks to Postula from its own servers: none of the person's cookies. A browser's
// cookies would also make Better Auth ask for an Origin, which an AI's server doesn't send.
async function aiRequest(
  playwright: PlaywrightWorkerArgs["playwright"],
  baseURL: string | undefined,
  use: (ai: APIRequestContext) => Promise<void>,
) {
  const context = await playwright.request.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  await use(context);
  await context.dispose();
}
const aiTest = ownerTest.extend<{ ai: APIRequestContext }>({
  ai: ({ playwright, baseURL }, use) => aiRequest(playwright, baseURL, use),
});
const signedOutAiTest = test.extend<{ ai: APIRequestContext }>({
  ai: ({ playwright, baseURL }, use) => aiRequest(playwright, baseURL, use),
});

aiTest.describe("Feature: connecting an AI to Postula", () => {
  aiTest(
    "Scenario: they allow Claude and Claude gets a token that opens their Postula",
    async ({ page, ai, db, account, expectAccessible }) => {
      const name = `Claude ${randomBytes(3).toString("hex")}`;
      const { clientId, verifier, callback } = await aiTest.step(
        "Given an AI that asks to connect to their Postula",
        async () => {
          const clientId = await registerAi(ai, name);
          return { clientId, ...(await startConnecting(page, clientId)) };
        },
      );

      await aiTest.step("Then they're asked whether to let it, and what it could do", async () => {
        await expect(
          page.getByRole("heading", { name: `Let ${name} use your Postula?` }),
        ).toBeVisible();
        await expect(
          page.getByText("See your job search, your profile and how your applications are going."),
        ).toBeVisible();
        await expect(page.getByText(/Make changes for you/)).toBeVisible();
        await expectAccessible(page);
      });

      await aiTest.step("When they allow it", async () => {
        await page.getByRole("button", { name: "Allow", exact: true }).click();
        await expect.poll(() => callback()?.searchParams.get("state")).toBe("e2e-state");
      });

      await aiTest.step("Then the AI trades the code for a token that is theirs", async () => {
        const code = callback()?.searchParams.get("code");
        expect(code).toBeTruthy();
        const response = await ai.post("/api/auth/oauth2/token", {
          form: {
            grant_type: "authorization_code",
            code: code ?? "",
            redirect_uri: redirectUri,
            client_id: clientId,
            code_verifier: verifier,
            resource,
          },
        });
        expect(response.ok()).toBe(true);
        const token = await response.json();
        expect(token.access_token).toMatch(/^pst_at_/);
        const caller = await authenticateAiToken(db, token.access_token);
        expect(caller).toMatchObject({
          userId: account.tenant.userId,
          clientName: name,
          scopes: ["read", "write", "offline_access"],
        });
      });
    },
  );

  aiTest("Scenario: they don't allow it and the AI is told no", async ({ page, ai }) => {
    const { callback } = await aiTest.step("Given an AI that asks to connect", async () => {
      const clientId = await registerAi(ai, "Some AI");
      return startConnecting(page, clientId);
    });

    await aiTest.step("When they don't allow it", async () => {
      await page.getByRole("button", { name: "Don't allow" }).click();
    });

    await aiTest.step("Then the AI gets access_denied and no code", async () => {
      await expect.poll(() => callback()?.searchParams.get("error")).toBe("access_denied");
      expect(callback()?.searchParams.get("code")).toBeNull();
    });
  });

  signedOutAiTest(
    "Scenario: someone signed out signs in with the email link and lands on the AI's request",
    async ({ page, ai, baseURL }) => {
      const email = uniqueEmail("ai");
      await signedOutAiTest.step(
        "Given an AI that asks to connect while they're signed out",
        async () => {
          const clientId = await registerAi(ai, "ChatGPT");
          await startConnecting(page, clientId);
          await expect(page).toHaveURL(/\/login\?redirectTo=/);
        },
      );

      await signedOutAiTest.step("When they sign in with the link in their email", async () => {
        await page.getByRole("link", { name: "Email me a link instead, no password" }).click();
        await page.getByLabel("Email").fill(email);
        await page.getByRole("button", { name: "Email me the link" }).click();
        await expect(page.getByRole("main").getByRole("status")).toContainText(email);
        await page.goto(await getLinkFromEmail(email, baseURL));
      });

      await signedOutAiTest.step(
        "Then they're asked whether to let ChatGPT use their Postula",
        async () => {
          await expect(
            page.getByRole("heading", { name: "Let ChatGPT use your Postula?" }),
          ).toBeVisible();
          await expect(page.getByText(email)).toBeVisible();
        },
      );
    },
  );
});
