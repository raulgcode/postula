import { expect, ownerTest, test } from "../support/fixtures";

const schemes = ["light", "dark"] as const;
// Public pages, before signing in.
const publicPages = ["/", "/login", "/login?with=link", "/sign-up", "/forgot-password"];
// Sections of the panel, after /app. A new section goes here.
const panelSections = [
  "",
  "/settings",
  "/profile",
  "/profile/edit",
  "/profile/import",
  "/profile/items/new?kind=experience",
  "/searches",
  "/searches/new",
];
// Pages of a signed-in person outside the panel. The consent page with a real request is checked
// in ai-connection.spec.ts; without one it says the request expired.
const signedInPages = ["/oauth/consent"];

test.describe("Feature: accessibility (axe, WCAG 2.2 AA)", () => {
  for (const colorScheme of schemes) {
    test.describe(`${colorScheme} theme`, () => {
      test.use({ colorScheme });

      for (const path of publicPages) {
        test(`Scenario: ${path} has no violations`, async ({ page, expectAccessible }) => {
          await page.goto(path);
          await expectAccessible(page);
        });
      }

      ownerTest(
        "Scenario: the panel sections have no violations",
        async ({ page, expectAccessible }) => {
          for (const path of [
            ...panelSections.map((section) => `/app${section}`),
            ...signedInPages,
          ]) {
            await page.goto(path);
            await expectAccessible(page);
          }
        },
      );
    });
  }

  test("Scenario: a form's errors have no violations either", async ({
    page,
    expectAccessible,
  }) => {
    await page.goto("/sign-up");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Enter your name")).toBeVisible();
    await expectAccessible(page);
  });
});
