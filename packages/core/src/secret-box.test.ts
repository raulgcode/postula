import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createSecretBox } from "./secret-box";

const key = randomBytes(32).toString("base64url");

describe("createSecretBox", () => {
  it("opens what it sealed, and never keeps the value in the clear", () => {
    const box = createSecretBox(key);
    const sealed = box.seal("ya29.refresh-token", "gmail:user-1");

    expect(sealed).toMatch(/^v1\./);
    expect(sealed).not.toContain("ya29");
    expect(box.open(sealed, "gmail:user-1")).toBe("ya29.refresh-token");
  });

  it("seals the same value differently each time", () => {
    const box = createSecretBox(key);
    expect(box.seal("x", "c")).not.toBe(box.seal("x", "c"));
  });

  it("refuses a value moved to another context, another key or tampered with", () => {
    const box = createSecretBox(key);
    const sealed = box.seal("secret", "gmail:user-1");

    expect(() => box.open(sealed, "gmail:user-2")).toThrow();
    expect(() =>
      createSecretBox(randomBytes(32).toString("base64url")).open(sealed, "gmail:user-1"),
    ).toThrow();
    const tampered = `${sealed.slice(0, -2)}${sealed.endsWith("AA") ? "BB" : "AA"}`;
    expect(() => box.open(tampered, "gmail:user-1")).toThrow();
    expect(() => box.open("plain text", "gmail:user-1")).toThrow(/Not a sealed value/);
  });

  it("needs a 32-byte key", () => {
    expect(() => createSecretBox("short")).toThrow(/32-byte/);
  });
});
