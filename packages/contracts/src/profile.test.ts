import { describe, expect, it } from "vitest";
import { importProfileSchema, profileHeaderSchema, saveProfileItemSchema } from "./profile";

describe("saveProfileItemSchema", () => {
  it("takes a job with its dates, and an empty end as the current job", () => {
    const parsed = saveProfileItemSchema.parse({
      kind: "experience",
      data: { title: " Frontend Engineer ", organization: "Micro1", start: "2026-03" },
    });
    expect(parsed).toEqual({
      kind: "experience",
      data: { title: "Frontend Engineer", organization: "Micro1", start: "2026-03" },
    });
  });

  it("rejects a date that is neither a year nor a month", () => {
    const result = saveProfileItemSchema.safeParse({
      kind: "experience",
      data: { title: "Engineer", organization: "Acme", start: "March 2024" },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("forms.yearMonthInvalid");
  });

  it("reads a form's comma and line separated skills as the same list an AI sends", () => {
    const fromForm = saveProfileItemSchema.parse({
      kind: "skill_group",
      data: { category: "Frontend", skills: "React, TypeScript\nReact\n , Vitest" },
    });
    const fromAi = saveProfileItemSchema.parse({
      kind: "skill_group",
      data: { category: "Frontend", skills: ["React", "TypeScript", "Vitest"] },
    });
    expect(fromForm).toEqual(fromAi);
    expect(fromAi.data).toEqual({
      category: "Frontend",
      skills: ["React", "TypeScript", "Vitest"],
    });
  });

  it("asks for at least one skill in a group", () => {
    const result = saveProfileItemSchema.safeParse({
      kind: "skill_group",
      data: { category: "Frontend", skills: " , " },
    });
    expect(result.error?.issues[0]?.message).toBe("forms.listRequired");
  });

  it("rejects an empty achievement", () => {
    const result = saveProfileItemSchema.safeParse({ kind: "achievement", data: { text: "  " } });
    expect(result.error?.issues[0]?.message).toBe("forms.fieldRequired");
  });
});

describe("profileHeaderSchema", () => {
  it("writes the profile in English unless the person says otherwise", () => {
    expect(
      profileHeaderSchema.parse({ name: "Raúl", headline: "Engineer", links: "github.com/a" }),
    ).toEqual({ name: "Raúl", headline: "Engineer", links: ["github.com/a"], locale: "en" });
  });
});

describe("importProfileSchema", () => {
  it("ignores what the file carries besides the profile and its items", () => {
    const parsed = importProfileSchema.parse({
      source: "cv.docx",
      profile: { name: "Raúl", headline: "Engineer", links: [] },
      items: [{ id: "exp-1", kind: "experience", data: { title: "Engineer" } }],
    });
    expect(parsed).not.toHaveProperty("source");
    expect(parsed.items).toHaveLength(1);
  });
});
