import { describe, expect, it } from "vitest";
import { workerStateOf } from "./search";

const now = new Date("2026-11-19T14:00:00Z");
const secondsAgo = (s: number) => new Date(now.getTime() - s * 1000);

describe("workerStateOf", () => {
  it("is running when the worker beat in the last minute and a half, whatever Fly says", () => {
    expect(workerStateOf("unknown", secondsAgo(30), now)).toBe("running");
    expect(workerStateOf("stopped", secondsAgo(89), now)).toBe("running");
  });

  it("is starting when Fly started it but it hasn't answered yet", () => {
    expect(workerStateOf("started", null, now)).toBe("starting");
    expect(workerStateOf("started", secondsAgo(120), now)).toBe("starting");
  });

  it("is stopped or unknown as Fly says when there is no recent heartbeat", () => {
    expect(workerStateOf("stopped", secondsAgo(91), now)).toBe("stopped");
    expect(workerStateOf("unknown", null, now)).toBe("unknown");
  });
});
