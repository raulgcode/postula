import { ownerTest, test } from "../support/fixtures";

// Where the Planner and the Generator (.claude/agents) start: the worker's person, signed in, on
// their home. What a scenario needs on top of this goes through core with `account.tenant`. Not a
// scenario: it checks nothing.
test.describe("Seed", () => {
  ownerTest("seed", async ({ page }) => {
    await page.goto("/app");
  });
});
