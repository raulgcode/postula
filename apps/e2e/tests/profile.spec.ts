import type { TenantContext } from "@postula/core";
import {
  guardarItemPerfil,
  importarPerfil,
  localWorkerMachines,
  runOperation,
} from "@postula/core";
import { expect, test } from "../support/fixtures";
import { openSection } from "../support/navigation";

// Each scenario signs in with an account of its own: the profile is the person's, and these
// change it.
const cv = {
  profile: {
    name: "Ana Mora",
    headline: "Frontend Engineer",
    location: "San José, Costa Rica",
    links: ["github.com/anamora"],
    summary: "Eight years building accessible web apps.",
  },
  items: [
    { id: "exp-1", kind: "experience", data: { title: "Frontend Engineer", organization: "Acme" } },
    {
      id: "exp-1-a1",
      kind: "achievement",
      parentId: "exp-1",
      data: { text: "Built the design system." },
    },
    {
      id: "skills-1",
      kind: "skill_group",
      data: { category: "Frontend", skills: ["React", "Vitest"] },
    },
  ],
};

/** Prepares the profile as the panel would, through core's operations. */
const prepare = (tenant: TenantContext) => ({
  tenant,
  services: { machines: localWorkerMachines },
  via: "web" as const,
});

test.describe("Feature: the master profile", () => {
  test("Scenario: they load their CV as JSON and see the job with its achievement", async ({
    page,
    signIn,
  }) => {
    await test.step("Given a person with an empty profile", async () => {
      await signIn(page);
      await openSection(page, "Profile");
      await expect(page.getByRole("heading", { name: "Your profile is empty" })).toBeVisible();
    });

    await test.step("When they paste their CV and load it", async () => {
      await page.getByRole("main").getByRole("link", { name: "Load a CV" }).first().click();
      await page.getByLabel("Your CV as JSON").fill(JSON.stringify(cv));
      await page.getByRole("button", { name: "Load and replace my profile" }).click();
    });

    await test.step("Then the profile shows their details, the job and its achievement", async () => {
      await expect(page.getByRole("heading", { level: 2, name: "Ana Mora" })).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 3, name: "Frontend Engineer · Acme" }),
      ).toBeVisible();
      await expect(
        page.getByRole("list", { name: "Achievements in Frontend Engineer · Acme" }),
      ).toHaveText("Built the design system.");
      await expect(page.getByText("React, Vitest")).toBeVisible();
    });
  });

  test("Scenario: pasting something that isn't a profile says so and changes nothing", async ({
    page,
    signIn,
  }) => {
    await signIn(page);
    await page.goto("/app/profile/import");
    await page.getByLabel("Your CV as JSON").fill('{"name": "Ana"}');
    await page.getByRole("button", { name: "Load and replace my profile" }).click();
    await expect(page.getByText("This isn't a profile Postula can read.")).toBeVisible();
  });

  test("Scenario: they add a job and an achievement under it", async ({ page, signIn }) => {
    await test.step("Given a person on their profile", async () => {
      await signIn(page);
      await openSection(page, "Profile");
    });

    await test.step("When they add a job, with a date written wrong first", async () => {
      await page.getByRole("link", { name: "Add a job" }).click();
      await page.getByLabel("Job title").fill("Staff Engineer");
      await page.getByLabel("Company").fill("Globex");
      await page.getByLabel("Started").fill("March 2021");
      await page.getByRole("button", { name: "Save" }).click();
      await expect(
        page.getByText("Write the year, or the year and month: 2024 or 2024-03"),
      ).toBeVisible();
      await page.getByLabel("Started").fill("2021-03");
      await page.getByRole("button", { name: "Save" }).click();
    });

    await test.step("And an achievement under it", async () => {
      await page.getByRole("link", { name: "Add an achievement" }).click();
      await expect(page.getByText("In Staff Engineer · Globex")).toBeVisible();
      await page
        .getByLabel("What you did and what came of it")
        .fill("Led the move to React Router.");
      await page.getByRole("button", { name: "Save" }).click();
    });

    await test.step("Then the job shows its dates as current and the achievement under it", async () => {
      await expect(page.getByText("2021-03 – Present")).toBeVisible();
      await expect(
        page.getByRole("list", { name: "Achievements in Staff Engineer · Globex" }),
      ).toHaveText("Led the move to React Router.");
    });
  });

  test("Scenario: they move the second job above the first", async ({
    page,
    signIn,
    accountOf,
  }) => {
    await test.step("Given a person with two jobs", async () => {
      const { tenant } = await accountOf(await signIn(page));
      for (const title of ["First", "Second"]) {
        await runOperation(guardarItemPerfil, prepare(tenant), {
          kind: "experience",
          data: { title, organization: "Acme" },
        });
      }
    });

    await test.step("When they move the second one up", async () => {
      await page.goto("/app/profile");
      await page.getByRole("button", { name: "Move Second · Acme up" }).click();
    });

    await test.step("Then it comes first", async () => {
      const jobs = page
        .getByRole("region", { name: "Experience" })
        .getByRole("heading", { level: 3 });
      await expect(jobs).toHaveText(["Second · Acme", "First · Acme"]);
    });
  });

  test("Scenario: they delete a job and its achievements go with it", async ({
    page,
    signIn,
    accountOf,
  }) => {
    await test.step("Given a person with a job that has an achievement", async () => {
      const { tenant } = await accountOf(await signIn(page));
      await runOperation(importarPerfil, prepare(tenant), cv);
    });

    await test.step("When they delete the job", async () => {
      await page.goto("/app/profile");
      await page.getByRole("link", { name: "Edit Frontend Engineer · Acme" }).click();
      await page.getByText("Delete this job and its achievements").click();
      await page.getByRole("button", { name: "Yes, delete it" }).click();
    });

    await test.step("Then Experience is empty", async () => {
      await expect(
        page.getByRole("region", { name: "Experience" }).getByText("Nothing here yet."),
      ).toBeVisible();
    });
  });
});
