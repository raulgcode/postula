import { describe, expect, it } from "vitest";
import { setSearchSchema } from "./search";

describe("setSearchSchema", () => {
  it("reads a missing value as off, as a form sends an unchecked switch", () => {
    expect(setSearchSchema.parse({})).toEqual({ active: false });
    expect(setSearchSchema.parse({ active: true })).toEqual({ active: true });
  });
});
