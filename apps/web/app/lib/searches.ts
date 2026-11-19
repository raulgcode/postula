import type { SearchSettings } from "@postula/contracts";

/** A search as the form shows it: lists one per line, numbers and booleans as Conform reads them. */
export function searchFormDefaults(settings: SearchSettings) {
  const { criteria } = settings;
  const lines = (values: string[]) => values.join("\n");
  return {
    ...settings,
    criteria: {
      titles: { ...criteria.titles, values: lines(criteria.titles.values) },
      keywords: {
        ...criteria.keywords,
        include: lines(criteria.keywords.include),
        exclude: lines(criteria.keywords.exclude),
      },
      remote: criteria.remote,
      regions: { ...criteria.regions, values: lines(criteria.regions.values) },
      salary: criteria.salary,
      excludedCompanies: lines(criteria.excludedCompanies),
    },
  };
}
