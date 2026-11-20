import type { BoardPosting } from "./job-posting";
import type { SearchCriteria } from "./job-search";

/**
 * Why a posting is set aside: only what the person marked as required, plus the companies they
 * never want. Everything else is a preference that the score weighs, never a reason alone.
 */
export const setAsideReasons = [
  "excluded_company",
  "not_remote",
  "region",
  "title",
  "keywords",
  "excluded_keyword",
  "salary",
] as const;
export type SetAsideReason = (typeof setAsideReasons)[number];

export type FilterablePosting = Pick<
  BoardPosting,
  "title" | "company" | "location" | "workplace" | "description" | "salary"
>;

/** Lowercase, without accents or punctuation, padded so a word matches only as a whole word. */
const plain = (text: string) =>
  ` ${text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim()} `;

const has = (haystack: string, needle: string) => {
  const word = plain(needle).trim();
  return word.length > 0 && haystack.includes(` ${word} `);
};

/**
 * The ways a board writes a place the person named. "Latin America" is also LATAM, South and
 * Central America; "Anywhere" is also worldwide or global. Any other place matches as written.
 */
const regionAliases: Record<string, string[]> = {
  "costa rica": ["costa rica"],
  "latin america": [
    "latin america",
    "latam",
    "lat am",
    "latinoamerica",
    "america latina",
    "south america",
    "central america",
    "centroamerica",
  ],
  americas: ["americas"],
  anywhere: ["anywhere", "worldwide", "world wide", "global", "globally", "any location"],
};

/**
 * Places a board names to say who it hires, when that isn't everyone: "Anywhere in the United
 * States" or "Remote (US, Canada)" isn't anywhere for someone in Costa Rica.
 */
const limitingPlaces: Record<string, string[]> = {
  "united states": ["united states", "usa", "us", "u s", "u s a", "north america"],
  canada: ["canada", "north america"],
  "united kingdom": ["united kingdom", "uk", "great britain", "england"],
  europe: ["europe", "eu", "emea"],
  asia: ["apac", "asia", "india"],
  australia: ["australia", "new zealand", "anz"],
};

function aliasesOf(region: string): string[] {
  const key = plain(region).trim();
  if (key === "latam" || key === "latinoamerica" || key === "america latina") {
    return regionAliases["latin america"] ?? [key];
  }
  if (key === "worldwide" || key === "global" || key === "cualquier lugar") {
    return regionAliases.anywhere ?? [key];
  }
  const limiting = Object.entries(limitingPlaces).find(
    ([place, names]) => place === key || names.includes(key),
  );
  return regionAliases[key] ?? limiting?.[1] ?? [key];
}

/** The limiting places a text names that the person didn't ask for. */
function otherPlacesIn(text: string, regions: string[]): string[] {
  const asked = regions.flatMap(aliasesOf);
  return Object.entries(limitingPlaces)
    .filter(([, names]) => names.some((name) => has(text, name) && !asked.includes(name)))
    .map(([place]) => place);
}

/**
 * Whether a posting's place names one of the person's regions ("Remote - LATAM" names LATAM).
 * "Anywhere" (or worldwide) only counts when it isn't narrowed to another place, as in
 * "Anywhere in the United States".
 */
export function locationMatchesRegions(location: string, regions: string[]): boolean {
  const where = plain(location);
  const narrowed = has(where, "anywhere in") || otherPlacesIn(where, regions).length > 0;
  return regions.some((region) => {
    const everywhere =
      plain(region).trim() === "anywhere" || aliasesOf(region).includes("anywhere");
    if (everywhere && narrowed) return false;
    return aliasesOf(region).some((alias) => has(where, alias));
  });
}

/**
 * Whether a title says it only hires in a place the person didn't ask for: "US Based",
 * "Canada only", "Based in the UK", "Remote US".
 */
export function titleLimitsToOtherPlace(title: string, regions: string[]): boolean {
  const text = plain(title);
  return Object.entries(limitingPlaces).some(([, names]) =>
    names.some(
      (name) =>
        !regions.flatMap(aliasesOf).includes(name) &&
        [
          `${name} based`,
          `${name} only`,
          `based in ${name}`,
          `based in the ${name}`,
          `remote ${name}`,
          `${name} remote`,
        ].some((phrase) => has(text, phrase)),
    ),
  );
}

/**
 * The reasons a search sets a posting aside, in order; empty when it stays in the list. A
 * required criterion is strict: a posting that doesn't say it (an office posting without
 * "remote", a "Remote" without the place it hires from) doesn't meet it.
 */
export function setAsideReasonsOf(
  posting: FilterablePosting,
  criteria: SearchCriteria,
): SetAsideReason[] {
  const reasons: SetAsideReason[] = [];
  const company = plain(posting.company);
  if (criteria.excludedCompanies.some((excluded) => has(company, excluded))) {
    reasons.push("excluded_company");
  }

  const { remote, regions, titles, keywords, salary } = criteria;
  if (remote.required && remote.value !== "any") {
    const allowed = remote.value === "remote" ? ["remote"] : ["remote", "hybrid"];
    if (!allowed.includes(posting.workplace)) reasons.push("not_remote");
  }

  if (regions.required && regions.values.length > 0) {
    if (
      !locationMatchesRegions(posting.location, regions.values) ||
      titleLimitsToOtherPlace(posting.title, regions.values)
    ) {
      reasons.push("region");
    }
  }

  const title = plain(posting.title);
  if (titles.required && titles.values.length > 0) {
    if (!titles.values.some((word) => has(title, word))) reasons.push("title");
  }

  if (keywords.required) {
    const text = plain(`${posting.title} ${posting.description}`);
    if (keywords.include.length > 0 && !keywords.include.some((word) => has(text, word))) {
      reasons.push("keywords");
    }
    if (keywords.exclude.some((word) => has(text, word))) reasons.push("excluded_keyword");
  }

  // Only a pay the board states, in the same currency and a year's: unknown pay never sets aside.
  const paid = posting.salary;
  if (
    salary.required &&
    salary.minimum != null &&
    paid &&
    paid.interval === "year" &&
    paid.currency?.toUpperCase() === salary.currency
  ) {
    const top = paid.max ?? paid.min;
    if (top !== null && top < salary.minimum) reasons.push("salary");
  }
  return reasons;
}
