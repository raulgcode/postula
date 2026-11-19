import { expect, ownerTest, test } from "../support/fixtures";
import { openSection } from "../support/navigation";

test.describe("Feature: the panel", () => {
  ownerTest("Scenario: /app opens the person's home, greeting them", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Hi, /);
  });

  ownerTest(
    "Scenario: an address that doesn't exist answers that it wasn't found",
    async ({ page }) => {
      const response = await page.goto("/app/someone-else");
      expect(response?.status()).toBe(404);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "We couldn't find this page",
      );
    },
  );

  // Its own account: the language is saved on the account too, and the worker's person is shared.
  test("Scenario: they switch the language to Spanish in Settings", async ({ page, signIn }) => {
    await test.step("Given a person on their settings", async () => {
      await signIn(page);
      await openSection(page, "Settings");
    });

    await test.step("When they pick Spanish", async () => {
      await page.getByRole("radio", { name: "Español" }).check();
    });

    await test.step("Then the app answers in Spanish", async () => {
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ajustes");
    });
  });

  // Its own account: signing out ends the session that the worker's `ownerTest`s share.
  test("Scenario: they sign out and /app asks them to sign in again", async ({ page, signIn }) => {
    await signIn(page);
    await openSection(page, "Settings");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login\?redirectTo=%2Fapp$/);
  });
});
