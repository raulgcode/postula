import { describe, expect, it } from "vitest";
import { defaultSearchSettings, searchCriteriaSchema } from "./job-search";
import {
  type FilterablePosting,
  locationMatchesRegions,
  setAsideReasonsOf,
} from "./posting-filter";

const posting = (overrides: Partial<FilterablePosting> = {}): FilterablePosting => ({
  title: "Senior Frontend Engineer",
  company: "Acme",
  location: "Remote - LATAM",
  workplace: "remote",
  description: "React and TypeScript.",
  salary: null,
  ...overrides,
});

// The default search: remote and Costa Rica, Latin America or Anywhere are required.
const criteria = searchCriteriaSchema.parse(defaultSearchSettings.criteria);

describe("setAsideReasonsOf with the default search", () => {
  it("keeps remote postings that hire from Costa Rica, Latin America or anywhere", () => {
    for (const location of [
      "Remote - LATAM",
      "Remote, Costa Rica",
      "San José, Costa Rica (Remote)",
      "Remote — South America",
      "Anywhere",
      "Remote (Worldwide)",
    ]) {
      expect(setAsideReasonsOf(posting({ location }), criteria), location).toEqual([]);
    }
  });

  it("sets aside a hybrid job in the United States", () => {
    expect(
      setAsideReasonsOf(
        posting({ location: "New York, NY (Hybrid)", workplace: "hybrid" }),
        criteria,
      ),
    ).toEqual(["not_remote", "region"]);
  });

  it("sets aside a remote job that only hires in the United States, or doesn't say where", () => {
    expect(setAsideReasonsOf(posting({ location: "Remote - US" }), criteria)).toEqual(["region"]);
    expect(setAsideReasonsOf(posting({ location: "Remote" }), criteria)).toEqual(["region"]);
  });

  it("doesn't take an anywhere narrowed to the United States as anywhere", () => {
    for (const location of [
      "Anywhere in the United States",
      "Remote - Anywhere (US, Canada)",
      "Worldwide (USA only)",
    ]) {
      expect(setAsideReasonsOf(posting({ location }), criteria), location).toEqual(["region"]);
    }
    expect(setAsideReasonsOf(posting({ location: "Anywhere in Latin America" }), criteria)).toEqual(
      [],
    );
  });

  it("sets aside a job whose title says it only hires in the United States", () => {
    for (const title of [
      "General Manager, Sales - US Based",
      "Client Partner (US-Based)",
      "Senior Engineer - USA only",
      "Remote US - Staff Engineer",
    ]) {
      expect(setAsideReasonsOf(posting({ title, location: "Anywhere" }), criteria), title).toEqual([
        "region",
      ]);
    }
  });

  it("keeps a US-only title when the person asked for the United States", () => {
    const usa = searchCriteriaSchema.parse({
      regions: { values: ["United States"], required: true },
    });
    expect(
      setAsideReasonsOf(posting({ title: "Engineer - US Based", location: "Remote, USA" }), usa),
    ).toEqual([]);
  });

  it("sets aside an office job in Costa Rica", () => {
    expect(
      setAsideReasonsOf(
        posting({ location: "San José, Costa Rica", workplace: "onsite" }),
        criteria,
      ),
    ).toEqual(["not_remote"]);
  });
});

describe("setAsideReasonsOf with preferences only", () => {
  const preferences = searchCriteriaSchema.parse({
    remote: { value: "remote" },
    regions: { values: ["Costa Rica"] },
    titles: { values: ["Frontend"] },
    salary: { minimum: 50_000 },
  });

  it("never sets aside for what isn't required", () => {
    expect(
      setAsideReasonsOf(
        posting({
          title: "Backend Engineer",
          location: "Berlin",
          workplace: "onsite",
          salary: { min: 30_000, max: 40_000, currency: "USD", interval: "year" },
        }),
        preferences,
      ),
    ).toEqual([]);
  });

  it("always sets aside the companies the person never wants", () => {
    const never = searchCriteriaSchema.parse({ excludedCompanies: ["Globex"] });
    expect(setAsideReasonsOf(posting({ company: "Globex, Inc." }), never)).toEqual([
      "excluded_company",
    ]);
    expect(setAsideReasonsOf(posting({ company: "Globexx" }), never)).toEqual([]);
  });
});

describe("required title, keywords and salary", () => {
  const strict = searchCriteriaSchema.parse({
    titles: { values: ["Frontend", "React"], required: true },
    keywords: { include: ["TypeScript"], exclude: ["PHP"], required: true },
    salary: { minimum: 50_000, currency: "USD", required: true },
  });

  it("sets aside what misses each one", () => {
    expect(
      setAsideReasonsOf(
        posting({
          title: "Backend Engineer",
          description: "PHP and Laravel.",
          salary: { min: 30_000, max: 45_000, currency: "USD", interval: "year" },
        }),
        strict,
      ),
    ).toEqual(["title", "keywords", "excluded_keyword", "salary"]);
  });

  it("keeps a posting without a stated pay, or in another currency", () => {
    expect(setAsideReasonsOf(posting(), strict)).toEqual([]);
    expect(
      setAsideReasonsOf(
        posting({ salary: { min: 20_000, max: 30_000, currency: "EUR", interval: "year" } }),
        strict,
      ),
    ).toEqual([]);
  });
});

describe("locationMatchesRegions", () => {
  it("matches whole words only", () => {
    expect(locationMatchesRegions("Costa Rica", ["Costa Rica"])).toBe(true);
    expect(locationMatchesRegions("Remote - Americas", ["Latin America"])).toBe(false);
    expect(locationMatchesRegions("Remote - Américas", ["Americas"])).toBe(true);
    expect(locationMatchesRegions("Mexico City", ["Mexico"])).toBe(true);
  });
});
