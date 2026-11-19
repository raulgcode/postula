import { localWorkerMachines, runOperation, verAuditoria } from "@postula/core";
import { expect, test } from "../support/fixtures";

// Its own account in each scenario: the switch is the person's, and the worker's person is shared.
test.describe("Feature: turning the job search on and off from the panel", () => {
  test("Scenario: they turn the search on, the panel says it's on and it's recorded as theirs", async ({
    page,
    signIn,
    accountOf,
  }) => {
    const email = await test.step("Given someone on their home with the search off", async () => {
      const email = await signIn(page);
      await expect(page.getByText("Off: nothing runs and it costs nothing.")).toBeVisible();
      return email;
    });

    await test.step("When they turn it on", async () => {
      await page.getByRole("button", { name: "Turn the search on" }).click();
    });

    await test.step("Then the panel says it's searching and offers to turn it off", async () => {
      await expect(
        page.getByText("On: Postula searches and prepares applications for you every day."),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Turn the search off" })).toBeVisible();
    });

    await test.step("And the audit log says they did it from the panel", async () => {
      const { tenant } = await accountOf(email);
      const entries = await runOperation(
        verAuditoria,
        { tenant, services: { machines: localWorkerMachines }, via: "web" },
        {},
      );
      expect(entries.map(({ operation, via, outcome }) => ({ operation, via, outcome }))).toEqual([
        { operation: "encender_busqueda", via: "web", outcome: "ok" },
      ]);
    });
  });

  test("Scenario: after turning it off and reloading, the search stays off", async ({
    page,
    signIn,
  }) => {
    await signIn(page);
    await page.getByRole("button", { name: "Turn the search on" }).click();
    await page.getByRole("button", { name: "Turn the search off" }).click();
    await expect(page.getByRole("button", { name: "Turn the search on" })).toBeVisible();

    await page.reload();

    await expect(page.getByText("Off: nothing runs and it costs nothing.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Turn the search on" })).toBeVisible();
  });
});
