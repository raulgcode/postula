import { describe, expect, it } from "vitest";
import { aiConsentSchema, mcpUrl } from "./ai-connection";

describe("mcpUrl", () => {
  it("puts /mcp at the root of the API, whatever path the URL has", () => {
    expect(mcpUrl("https://api.postula.intensoft.dev")).toBe(
      "https://api.postula.intensoft.dev/mcp",
    );
    expect(mcpUrl("http://localhost:3001/")).toBe("http://localhost:3001/mcp");
  });
});

describe("aiConsentSchema", () => {
  it("only takes allow or deny", () => {
    expect(aiConsentSchema.safeParse({ intent: "allow" }).success).toBe(true);
    expect(aiConsentSchema.safeParse({ intent: "deny" }).success).toBe(true);
    expect(aiConsentSchema.safeParse({ intent: "maybe" }).success).toBe(false);
  });
});
