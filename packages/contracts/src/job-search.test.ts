import { describe, expect, it } from "vitest";
import {
  addSearchCompanySchema,
  createSearchSchema,
  defaultSearchSettings,
  searchFormSchema,
  searchSettingsSchema,
  suggestedCompanies,
} from "./job-search";

describe("searchSettingsSchema", () => {
  it("fills in what a new search leaves out with defaults that already work", () => {
    const parsed = searchSettingsSchema.parse({ name: "Frontend" });
    expect(parsed).toMatchObject({
      runAt: "08:00",
      timeZone: "America/Costa_Rica",
      mode: "semi",
      minScore: 70,
      dailyLimit: 10,
      enabled: true,
      criteria: { remote: { value: "remote", required: false }, salary: { currency: "USD" } },
    });
  });

  it("takes the agreed first search as valid: remote and place required, the rest preferences", () => {
    const parsed = searchSettingsSchema.parse(defaultSearchSettings);
    const { criteria } = parsed;
    expect(criteria.remote).toEqual({ value: "remote", required: true });
    expect(criteria.regions).toEqual({
      values: ["Costa Rica", "Latin America", "Anywhere"],
      required: true,
    });
    expect(
      [criteria.titles, criteria.keywords, criteria.salary].every(
        (criterion) => criterion.required === false,
      ),
    ).toBe(true);
    expect(criteria.salary).toMatchObject({ ideal: 60_000, minimum: 50_000 });
  });

  it("reads a form's lines and commas as lists", () => {
    const parsed = searchSettingsSchema.parse({
      name: "x",
      criteria: { regions: { values: "Costa Rica\nLatin America, Costa Rica" } },
    });
    expect(parsed.criteria.regions.values).toEqual(["Costa Rica", "Latin America"]);
  });

  it("rejects an hour, a time zone or a score that can't be", () => {
    const result = searchSettingsSchema.safeParse({
      name: "x",
      runAt: "25:00",
      timeZone: "Mars/Olympus",
      minScore: 120,
    });
    expect(result.error?.issues.map((issue) => issue.message).sort()).toEqual([
      "forms.numberInvalid",
      "forms.timeInvalid",
      "forms.timeZoneInvalid",
    ]);
  });
});

describe("companies", () => {
  it("lowercases a board name and rejects one with spaces", () => {
    const searchId = "7f1c3a52-6f0e-4b8e-9d0a-0d6f1b0e9a11";
    expect(addSearchCompanySchema.parse({ searchId, board: "lever", token: "Kraken " }).token).toBe(
      "kraken",
    );
    expect(
      addSearchCompanySchema.safeParse({ searchId, board: "lever", token: "grafana labs" }).error
        ?.issues[0]?.message,
    ).toBe("forms.boardTokenInvalid");
  });

  it("suggests valid boards, without repeats", () => {
    const parsed = createSearchSchema.parse({ name: "x", companies: suggestedCompanies });
    const keys = parsed.companies?.map((company) => `${company.board}:${company.token}`);
    expect(new Set(keys).size).toBe(suggestedCompanies.length);
  });
});

describe("the panel's search form", () => {
  it("reads an unchecked 'runs' box as off and an AI's missing one as on", () => {
    expect(searchFormSchema.parse({ name: "Paused" }).enabled).toBe(false);
    expect(searchSettingsSchema.parse({ name: "Running" }).enabled).toBe(true);
  });

  it("splits a textarea's lines into one entry each, as the form sends them", () => {
    const parsed = searchFormSchema.parse({
      name: "x",
      criteria: {
        titles: { values: ["Senior Engineer\r\nStaff Engineer"] },
        regions: { values: ["Costa Rica\nLatin America\n\n Anywhere "] },
        excludedCompanies: ["Altimetrik\ncgi"],
      },
    });
    expect(parsed.criteria.titles.values).toEqual(["Senior Engineer", "Staff Engineer"]);
    expect(parsed.criteria.regions.values).toEqual(["Costa Rica", "Latin America", "Anywhere"]);
    expect(parsed.criteria.excludedCompanies).toEqual(["Altimetrik", "cgi"]);
  });

  it("keeps a comma inside one line of a textarea, like a company's name", () => {
    const parsed = searchFormSchema.parse({
      name: "x",
      criteria: { excludedCompanies: ["Acme, Inc."] },
    });
    expect(parsed.criteria.excludedCompanies).toEqual(["Acme, Inc."]);
  });
});
