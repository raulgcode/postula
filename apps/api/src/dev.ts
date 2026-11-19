// `pnpm dev`: the API and the worker in one watched process. In production they are two Fly
// process groups (fly.api.toml), so the switch can stop the worker while the API keeps serving.
await import("./server");
await import("./worker");
