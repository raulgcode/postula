import { expect, test } from "../support/fixtures";
import { openSection } from "../support/navigation";

// Each scenario signs in with an account of its own: searches are the person's, and these
// change them.
test.describe("Feature: searches", () => {
  test("Scenario: they create the usual search and it starts with 27 suggested companies", async ({
    page,
    signIn,
    expectAccessible,
  }) => {
    await test.step("Given a person without searches", async () => {
      await signIn(page);
      await openSection(page, "Searches");
      await expect(
        page.getByRole("heading", { name: "You don't have a search yet" }),
      ).toBeVisible();
    });

    await test.step("When they start a new search and save it as it comes", async () => {
      await page.getByRole("link", { name: "New search" }).click();
      await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Remote, well paid");
      await expect(page.getByLabel("Ideal pay a year")).toHaveValue("60000");
      await page.getByRole("button", { name: "Create the search" }).click();
    });

    await test.step("Then they land on it with the suggested companies", async () => {
      await expect(
        page.getByRole("heading", { level: 1, name: "Remote, well paid" }),
      ).toBeVisible();
      await expect(
        page.getByRole("list", { name: "Companies it looks in" }).getByRole("listitem"),
      ).toHaveCount(27);
      await expectAccessible(page);
    });

    await test.step("And the list shows when it runs", async () => {
      await openSection(page, "Searches");
      const search = page.getByRole("link", { name: "Open Remote, well paid" });
      await expect(search).toContainText("Every day at 08:00 (America/Costa_Rica)");
      await expect(search).toContainText("27 companies");
    });
  });

  test("Scenario: they make the title required, raise the pay and pause it, and it stays saved", async ({
    page,
    signIn,
  }) => {
    await test.step("Given a person with the usual search", async () => {
      await signIn(page);
      await page.goto("/app/searches/new");
      await page.getByRole("button", { name: "Create the search" }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "Remote, well paid" }),
      ).toBeVisible();
    });

    await test.step("When they change the criteria and save", async () => {
      await page.getByLabel("Name", { exact: true }).fill("Senior React");
      await page.getByLabel("Words in the job title").fill("Senior\nReact");
      // The first "Required" is the job title's.
      await page.getByLabel("Required").first().check();
      await page.getByLabel("Ideal pay a year").fill("75000");
      await page.getByLabel("This search runs every day").uncheck();
      await page.getByRole("button", { name: "Save" }).click();
    });

    await test.step("Then the page says it's saved and keeps the new values", async () => {
      await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
      await page.reload();
      await expect(page.getByRole("heading", { level: 1, name: "Senior React" })).toBeVisible();
      await expect(page.getByLabel("Words in the job title")).toHaveValue("Senior\nReact");
      await expect(page.getByLabel("Required").first()).toBeChecked();
      await expect(page.getByLabel("Ideal pay a year")).toHaveValue("75000");
      await expect(page.getByLabel("This search runs every day")).not.toBeChecked();
    });

    await test.step("And the list shows it paused", async () => {
      await openSection(page, "Searches");
      await expect(page.getByRole("link", { name: "Open Senior React" })).toContainText("Paused");
    });
  });

  test("Scenario: a time zone that doesn't exist is not saved and says why", async ({
    page,
    signIn,
  }) => {
    await test.step("Given a person starting a new search", async () => {
      await signIn(page);
      await page.goto("/app/searches/new");
    });

    await test.step("When they type a time zone that doesn't exist", async () => {
      await page.getByLabel("Time zone").fill("Mars/Olympus");
      await page.getByRole("button", { name: "Create the search" }).click();
    });

    await test.step("Then the field says so and the search isn't created", async () => {
      await expect(page.getByText("Pick a time zone such as America/Costa_Rica")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1, name: "New search" })).toBeVisible();
    });
  });

  test("Scenario: they add a company's board and take another out", async ({ page, signIn }) => {
    await test.step("Given a person with the usual search", async () => {
      await signIn(page);
      await page.goto("/app/searches/new");
      await page.getByRole("button", { name: "Create the search" }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "Remote, well paid" }),
      ).toBeVisible();
    });

    const companies = page.getByRole("list", { name: "Companies it looks in" });

    await test.step("When they add Ramp's Ashby board", async () => {
      await page.getByRole("radio", { name: "ashby" }).check();
      await page.getByLabel("Board name").fill("Ramp");
      await page.getByLabel("Company name (optional)").fill("Ramp");
      await page.getByRole("button", { name: "Add the company" }).click();
    });

    await test.step("Then Ramp is in the list, not checked yet", async () => {
      await expect(companies.getByRole("listitem")).toHaveCount(28);
      await expect(companies.getByRole("listitem").filter({ hasText: "Ramp" })).toContainText(
        "ashby · ramp · Not checked yet",
      );
    });

    await test.step("When they take Binance out", async () => {
      await page.getByRole("button", { name: "Take Binance out" }).click();
    });

    await test.step("Then Binance is gone, even after reloading", async () => {
      await expect(companies.getByRole("listitem")).toHaveCount(27);
      await page.reload();
      await expect(page.getByRole("button", { name: "Take Binance out" })).toHaveCount(0);
      await expect(companies.getByRole("listitem")).toHaveCount(27);
    });
  });

  test("Scenario: they delete a search and the list is empty again", async ({ page, signIn }) => {
    await test.step("Given a person with the usual search", async () => {
      await signIn(page);
      await page.goto("/app/searches/new");
      await page.getByRole("button", { name: "Create the search" }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "Remote, well paid" }),
      ).toBeVisible();
    });

    await test.step("When they delete it", async () => {
      await page.getByRole("button", { name: "Delete the search" }).click();
    });

    await test.step("Then they're back at an empty list", async () => {
      await expect(
        page.getByRole("heading", { name: "You don't have a search yet" }),
      ).toBeVisible();
    });
  });
});
