import type { BoardPosting } from "@postula/contracts";
import { defaultSearchSettings } from "@postula/contracts";
import {
  correrBusqueda,
  crearBusqueda,
  type JobBoardReader,
  localWorkerMachines,
  runOperation,
  type TenantContext,
} from "@postula/core";
import { expect, test } from "../support/fixtures";
import { openSection } from "../support/navigation";

const posting = (externalId: string, overrides: Partial<BoardPosting>): BoardPosting => ({
  externalId,
  title: "Frontend Engineer",
  company: "Acme",
  location: "Remote - Americas",
  workplace: "remote",
  url: `https://job-boards.greenhouse.io/acme/jobs/${externalId}`,
  applyUrl: null,
  description: "Build accessible React apps.",
  publishedAt: "2026-11-10T14:00:00.000Z",
  salary: null,
  department: null,
  employmentType: null,
  ...overrides,
});

/** Two boards that list the same job, as the real ones would answer, without the network. */
const boards: JobBoardReader = {
  async read(_board, token) {
    if (token === "acme") {
      return {
        status: "ok",
        postings: [
          posting("1", {
            title: "Senior Frontend Engineer",
            salary: { min: 60000, max: 80000, currency: "USD", interval: "year" },
          }),
          posting("2", { title: "Design Engineer", workplace: "hybrid", location: "Austin" }),
        ],
      };
    }
    if (token === "initech") {
      return {
        status: "ok",
        postings: [
          posting("31", {
            company: "Initech",
            title: "React Engineer",
            location: "Remote - LATAM",
          }),
          posting("32", {
            company: "Initech",
            title: "Staff Engineer",
            location: "New York, NY (Hybrid)",
            workplace: "hybrid",
          }),
        ],
      };
    }
    if (token === "acme-jobs") {
      return { status: "ok", postings: [posting("90", { title: "Senior Frontend Engineer" })] };
    }
    return { status: "not_found" };
  },
};

const prepare = (tenant: TenantContext) => ({
  tenant,
  services: { machines: localWorkerMachines, boards },
  via: "web" as const,
});

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

  test("Scenario: after a search ran, they see each job once with its pay, and which board failed", async ({
    page,
    signIn,
    accountOf,
    expectAccessible,
  }) => {
    await test.step("Given a search that read two boards with the same job and one that doesn't exist", async () => {
      const { tenant } = await accountOf(await signIn(page));
      const search = await runOperation(crearBusqueda, prepare(tenant), {
        name: "Frontend",
        companies: [
          { board: "greenhouse", token: "acme", company: "Acme" },
          { board: "lever", token: "acme-jobs", company: "Acme (Lever)" },
          { board: "ashby", token: "gone", company: "Gone" },
        ],
      });
      await runOperation(correrBusqueda, prepare(tenant), { id: search.id });
      await page.goto(`/app/searches/${search.id}`);
    });

    await test.step("Then the search says what it found and which board it couldn't read", async () => {
      await expect(
        page.getByText("The boards list 3 postings: 3 new, 0 closed since the time before."),
      ).toBeVisible();
      await expect(page.getByText("Couldn't read: Gone.")).toBeVisible();
    });

    await test.step("When they open the postings", async () => {
      await page.getByRole("link", { name: "See the 2 postings" }).click();
    });

    await test.step("Then the job on both boards shows once, with its pay", async () => {
      await expect(
        page.getByRole("heading", { level: 1, name: "Postings of Frontend" }),
      ).toBeVisible();
      const postings = page.getByRole("list", { name: "Postings" }).getByRole("listitem");
      await expect(postings).toHaveCount(2);
      await expect(postings.filter({ hasText: "Senior Frontend Engineer" })).toContainText(
        "Remote - Americas · Remote · 60,000–80,000 USD a year",
      );
      await expect(postings.filter({ hasText: "Design Engineer" })).toContainText(
        "Austin · Hybrid",
      );
      await expectAccessible(page);
    });
  });

  test("Scenario: the usual search keeps a remote LATAM job and sets aside a hybrid one in New York, saying why", async ({
    page,
    signIn,
    accountOf,
    expectAccessible,
  }) => {
    await test.step("Given the usual search ran on a board with both jobs", async () => {
      const { tenant } = await accountOf(await signIn(page));
      const search = await runOperation(crearBusqueda, prepare(tenant), {
        ...defaultSearchSettings,
        companies: [{ board: "greenhouse", token: "initech", company: "Initech" }],
      });
      await runOperation(correrBusqueda, prepare(tenant), { id: search.id });
      await page.goto(`/app/searches/${search.id}/postings`);
    });

    await test.step("Then only the remote LATAM job is in the list", async () => {
      const postings = page.getByRole("list", { name: "Postings" }).getByRole("listitem");
      await expect(postings).toHaveCount(1);
      await expect(postings).toContainText("React Engineer");
      await expect(page.getByRole("link", { name: "Set aside (1)" })).toBeVisible();
    });

    await test.step("When they open what was set aside", async () => {
      await page.getByRole("link", { name: "Set aside (1)" }).click();
    });

    await test.step("Then the New York job is there with its reasons", async () => {
      const postings = page.getByRole("list", { name: "Postings" }).getByRole("listitem");
      await expect(postings).toHaveCount(1);
      await expect(postings).toContainText(
        "Set aside: Not remote · Doesn't say it hires from Costa Rica, Latin America, or Anywhere",
      );
      await expectAccessible(page);
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
