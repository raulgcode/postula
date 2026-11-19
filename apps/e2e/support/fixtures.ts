import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import {
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  test as base,
  expect,
  type Page,
} from "@playwright/test";
import type { Database } from "@postula/db";
import { type Account, connectTestDatabase, findAccount } from "./database";
import { getLinkFromEmail, uniqueEmail } from "./mailpit";

interface Fixtures {
  /** Runs axe against the current page and fails on any WCAG 2.2 A/AA violation. */
  expectAccessible: (page: Page, options?: { exclude?: string[] }) => Promise<void>;
  /**
   * Signs in through the magic link and returns the email: a brand-new person, or `email` to
   * come back as an existing one.
   */
  signIn: (page: Page, email?: string) => Promise<string>;
  /** The account behind an email, to seed it through core. */
  accountOf: (email: string) => Promise<Account>;
  /**
   * Another browser of someone else (a teammate, the owner's other device), in the test's
   * language unless `options` says otherwise. Closed when the test ends, even if it fails.
   */
  newVisitor: (options?: BrowserContextOptions) => Promise<Page>;
}

interface WorkerFixtures {
  /** The e2e database, one connection per worker: seed data with `@postula/core`, not SQL. */
  db: Database;
  /**
   * Session of a signed-in person, created once per worker through the real magic link and
   * reused by every `ownerTest` in that worker.
   */
  ownerSession: { storageState: string; email: string };
}

async function signInThroughEmail(
  page: Page,
  baseURL: string | undefined,
  email = uniqueEmail("owner"),
): Promise<string> {
  await page.goto("/login?with=link");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me the link" }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText(email);
  await page.goto(await getLinkFromEmail(email, baseURL));
  return email;
}

async function createOwnerSession(
  browser: Browser,
  { baseURL, locale }: { baseURL: string; locale?: string },
  path: string,
) {
  // A context of our own doesn't get the project's `use`: without its locale the app would
  // answer in the machine's language.
  const context = await browser.newContext({ baseURL, locale });
  const page = await context.newPage();
  const email = await signInThroughEmail(page, baseURL);
  await expect(page).toHaveURL(/\/app$/);
  await context.storageState({ path });
  await context.close();
  return email;
}

export const test = base.extend<Fixtures, WorkerFixtures>({
  db: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructuring pattern here.
    async ({}, use) => {
      const connection = connectTestDatabase();
      await use(connection.db);
      await connection.close();
    },
    { scope: "worker" },
  ],
  ownerSession: [
    async ({ browser }, use, workerInfo) => {
      const baseURL = workerInfo.project.use.baseURL;
      if (!baseURL) throw new Error("baseURL is not set in playwright.config.ts");
      const dir = workerInfo.project.outputDir;
      mkdirSync(dir, { recursive: true });
      const storageState = `${dir}/owner-${workerInfo.workerIndex}.json`;
      const email = await createOwnerSession(
        browser,
        { baseURL, locale: workerInfo.project.use.locale },
        storageState,
      );
      await use({ storageState, email });
    },
    { scope: "worker" },
  ],
  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructuring pattern here.
  expectAccessible: async ({}, use) => {
    await use(async (page, { exclude = [] } = {}) => {
      // Colors mid-transition (e.g. right after switching theme) would give false contrast hits.
      await page.waitForFunction(() =>
        document.getAnimations().every((animation) => animation.playState !== "running"),
      );
      const builder = new AxeBuilder({ page }).withTags([
        "wcag2a",
        "wcag2aa",
        "wcag21a",
        "wcag21aa",
        "wcag22aa",
      ]);
      for (const selector of exclude) builder.exclude(selector);
      const results = await builder.analyze();
      expect(results.violations).toEqual([]);
    });
  },
  signIn: async ({ baseURL }, use) => {
    await use((page, email) => signInThroughEmail(page, baseURL, email));
  },
  accountOf: async ({ db }, use) => {
    await use((email) => findAccount(db, email));
  },
  newVisitor: async ({ browser, baseURL, locale }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async (options) => {
      // Signed out: `browser.newContext` would otherwise take the test's `storageState`.
      const context = await browser.newContext({
        baseURL,
        locale,
        storageState: { cookies: [], origins: [] },
        ...options,
      });
      contexts.push(context);
      return context.newPage();
    });
    await Promise.all(contexts.map((context) => context.close()));
  },
});

/**
 * Tests that start already signed in as the worker's person. Use it whenever the test does not
 * need a brand-new account; use `test` + `signIn` for flows that must start from zero
 * (sign-in, an empty account, anything that changes the account).
 */
export const ownerTest = test.extend<{ account: Account }>({
  storageState: ({ ownerSession }, use) => use(ownerSession.storageState),
  /** The worker's account, already signed in: seed it through core without visiting /app. */
  account: ({ db, ownerSession }, use) => findAccount(db, ownerSession.email).then(use),
});

export { expect };
