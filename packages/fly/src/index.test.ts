import { describe, expect, it } from "vitest";
import { createFlyWorkerMachines } from "./index";

function fakeFly(machines: { id: string; state: string; group: string }[], status = 200) {
  const calls: { method: string; url: string; authorization: string | null }[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({ method: init?.method ?? "GET", url, authorization: headers.get("authorization") });
    if (status !== 200) return new Response("nope", { status });
    if (url.endsWith("/machines")) {
      return Response.json(
        machines.map(({ id, state, group }) => ({
          id,
          state,
          config: { metadata: { fly_process_group: group } },
        })),
      );
    }
    return Response.json({ ok: true });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

const machines = [
  { id: "web1", state: "started", group: "app" },
  { id: "wrk1", state: "stopped", group: "worker" },
];

describe("createFlyWorkerMachines", () => {
  it("starts only the worker's stopped machines", async () => {
    const fly = fakeFly(machines);
    await createFlyWorkerMachines({ app: "postula-api", token: "t", fetch: fly.fetch }).start();

    expect(fly.calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "GET https://api.machines.dev/v1/apps/postula-api/machines",
      "POST https://api.machines.dev/v1/apps/postula-api/machines/wrk1/start",
    ]);
  });

  it("stops the worker and never the app's machines", async () => {
    const fly = fakeFly([
      { id: "web1", state: "started", group: "app" },
      { id: "wrk1", state: "started", group: "worker" },
    ]);
    await createFlyWorkerMachines({ app: "postula-api", token: "t", fetch: fly.fetch }).stop();

    expect(fly.calls.at(-1)?.url).toBe(
      "https://api.machines.dev/v1/apps/postula-api/machines/wrk1/stop",
    );
    expect(fly.calls).toHaveLength(2);
  });

  it("says started or stopped from the worker's machines only", async () => {
    const fly = fakeFly(machines);
    const worker = createFlyWorkerMachines({ app: "a", token: "t", fetch: fly.fetch });
    expect(await worker.state()).toBe("stopped");
  });

  it("sends a FlyV1 token as is and any other as a Bearer", async () => {
    const flyV1 = fakeFly(machines);
    await createFlyWorkerMachines({ app: "a", token: "FlyV1 fm2_x", fetch: flyV1.fetch }).state();
    const bearer = fakeFly(machines);
    await createFlyWorkerMachines({ app: "a", token: "abc", fetch: bearer.fetch }).state();

    expect(flyV1.calls[0]?.authorization).toBe("FlyV1 fm2_x");
    expect(bearer.calls[0]?.authorization).toBe("Bearer abc");
  });

  it("fails loudly when Fly refuses or there is no worker machine", async () => {
    const refused = fakeFly(machines, 401);
    await expect(
      createFlyWorkerMachines({ app: "a", token: "t", fetch: refused.fetch }).start(),
    ).rejects.toThrow(/401/);
    const noWorker = fakeFly([{ id: "web1", state: "started", group: "app" }]);
    await expect(
      createFlyWorkerMachines({ app: "a", token: "t", fetch: noWorker.fetch }).start(),
    ).rejects.toThrow(/No "worker" machine/);
  });
});
