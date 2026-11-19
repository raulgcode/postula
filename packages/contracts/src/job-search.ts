import { z } from "zod/mini";
import { message } from "./message";

/**
 * A search ("loop" in the plan): what the person is looking for, when Postula looks every day and
 * in which companies' job boards. Every criterion is a preference by default: it adds or takes
 * points and shows as a label, but the posting stays in the list. Only what the person marks as
 * required sets a posting aside before scoring, and even then it stays visible with its reason.
 */

/** The public job boards Postula reads, each by the company's board name ("token"). */
export const jobBoards = ["greenhouse", "lever", "ashby"] as const;
export type JobBoard = (typeof jobBoards)[number];

export const remoteOptions = ["remote", "hybrid", "any"] as const;
export type RemoteOption = (typeof remoteOptions)[number];

/** How far Postula goes alone: `manual` only lists, `semi` prepares and waits for approval. */
export const searchModes = ["manual", "semi"] as const;
export type SearchMode = (typeof searchModes)[number];

export const salaryCurrencies = ["USD", "EUR", "CRC"] as const;

export const SEARCH_NAME_MAX = 80;
export const SEARCH_LIST_MAX = 60;
export const SEARCHES_MAX = 20;
export const SEARCH_COMPANIES_MAX = 200;
export const SALARY_MAX = 10_000_000;

const name = z
  .string({ error: message("forms.fieldRequired") })
  .check(
    z.trim(),
    z.minLength(1, message("forms.fieldRequired")),
    z.maxLength(SEARCH_NAME_MAX, message("forms.fieldTooLong")),
  );

/** Words: one per line or separated by commas in a form, an array from an AI. */
const words = z.pipe(
  z.pipe(
    z.optional(z.union([z.array(z.string()), z.string()])),
    z.transform((value) => {
      const parts = Array.isArray(value) ? value : (value ?? "").split(/[,\n]/);
      return [...new Set(parts.map((part) => part.trim()).filter(Boolean))];
    }),
  ),
  z
    .array(z.string().check(z.maxLength(100, message("forms.fieldTooLong"))))
    .check(z.maxLength(SEARCH_LIST_MAX, message("forms.listTooLong"))),
);

/** A form sends an unchecked box as nothing, so missing means "not required". */
const required = z._default(z.boolean(), false);

const salaryAmount = z.optional(
  z.nullable(
    z
      .number({ error: message("forms.numberInvalid") })
      .check(
        z.int(message("forms.numberInvalid")),
        z.minimum(0, message("forms.numberInvalid")),
        z.maximum(SALARY_MAX, message("forms.numberInvalid")),
      ),
  ),
);

export const searchCriteriaSchema = z.object({
  /** Words the job title should have ("Frontend", "Full Stack"): more matches, more points. */
  titles: z.prefault(z.object({ values: words, required }), {}),
  /** Words that add points when the posting has them, and words that take points away. */
  keywords: z.prefault(z.object({ include: words, exclude: words, required }), {}),
  remote: z.prefault(
    z.object({ value: z._default(z.enum(remoteOptions), "remote"), required }),
    {},
  ),
  /** Where the posting has to accept people from ("Costa Rica", "Latin America", "Anywhere"). */
  regions: z.prefault(z.object({ values: words, required }), {}),
  /** A year's pay: below `ideal` takes points, below `minimum` takes more. Never a reason alone. */
  salary: z.prefault(
    z.object({
      ideal: salaryAmount,
      minimum: salaryAmount,
      currency: z._default(z.enum(salaryCurrencies), "USD"),
      required,
    }),
    {},
  ),
  /** Companies the person never wants: their postings are always set aside, with this reason. */
  excludedCompanies: words,
});
export type SearchCriteria = z.infer<typeof searchCriteriaSchema>;

/** "08:00": the hour Postula looks, in the search's time zone. */
const runAt = z
  .string({ error: message("forms.fieldRequired") })
  .check(z.regex(/^([01]\d|2[0-3]):[0-5]\d$/, message("forms.timeInvalid")));

const timeZone = z.string({ error: message("forms.fieldRequired") }).check(
  z.trim(),
  z.refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return value.length > 0;
    } catch {
      return false;
    }
  }, message("forms.timeZoneInvalid")),
);

const score = z
  .number({ error: message("forms.numberInvalid") })
  .check(
    z.int(message("forms.numberInvalid")),
    z.minimum(0, message("forms.numberInvalid")),
    z.maximum(100, message("forms.numberInvalid")),
  );

const dailyLimit = z
  .number({ error: message("forms.numberInvalid") })
  .check(
    z.int(message("forms.numberInvalid")),
    z.minimum(1, message("forms.numberInvalid")),
    z.maximum(50, message("forms.numberInvalid")),
  );

/** Everything about a search the person edits. */
export const searchSettingsSchema = z.object({
  name,
  criteria: z.prefault(searchCriteriaSchema, {}),
  runAt: z._default(runAt, "08:00"),
  timeZone: z._default(timeZone, "America/Costa_Rica"),
  mode: z._default(z.enum(searchModes), "semi"),
  /** Postings scoring this or more get a CV and a letter ready for approval. */
  minScore: z._default(score, 70),
  /** At most this many applications prepared a day for this search. */
  dailyLimit: z._default(dailyLimit, 10),
  /** Off: the search keeps everything but doesn't run. */
  enabled: z._default(z.boolean(), true),
});
export type SearchSettings = z.infer<typeof searchSettingsSchema>;

/** A company's job board: the ATS and its board name as it appears in the board's address. */
const companyBoard = z.object({
  board: z.enum(jobBoards, { error: message("forms.fieldRequired") }),
  token: z
    .string({ error: message("forms.fieldRequired") })
    .check(
      z.trim(),
      z.toLowerCase(),
      z.minLength(1, message("forms.fieldRequired")),
      z.maxLength(100, message("forms.fieldTooLong")),
      z.regex(/^[a-z0-9][a-z0-9._-]*$/, message("forms.boardTokenInvalid")),
    ),
  /** How the person calls it; the board name if left empty. */
  company: z.optional(
    z.nullable(z.string().check(z.trim(), z.maxLength(100, message("forms.fieldTooLong")))),
  ),
});

export const createSearchSchema = z.extend(searchSettingsSchema, {
  /** The companies to look in; leave it out to start with Postula's suggested list. */
  companies: z.optional(z.array(companyBoard).check(z.maxLength(SEARCH_COMPANIES_MAX))),
});
export type CreateSearchInput = z.infer<typeof createSearchSchema>;

const searchId = z.uuid({ error: message("forms.fieldRequired") });

/**
 * The panel's form: an unchecked "This search runs" box sends nothing, so there missing means
 * off. An AI leaving `enabled` out keeps the default (on).
 */
export const searchFormSchema = z.extend(searchSettingsSchema, {
  enabled: z._default(z.boolean(), false),
});

export const updateSearchFormSchema = z.extend(searchFormSchema, { id: searchId });

export const updateSearchSchema = z.extend(searchSettingsSchema, { id: searchId });
export type UpdateSearchInput = z.infer<typeof updateSearchSchema>;

export const searchIdSchema = z.object({ id: searchId });

export const addSearchCompanySchema = z.extend(companyBoard, { searchId });
export type AddSearchCompanyInput = z.infer<typeof addSearchCompanySchema>;

export const removeSearchCompanySchema = z.object({ searchId, companyId: searchId });

export interface SearchCompany {
  id: string;
  board: JobBoard;
  token: string;
  company: string;
  /** Whether the board answered the last time Postula checked it (`unchecked` until then). */
  status: "unchecked" | "ok" | "not_found";
  checkedAt: string | null;
}

export interface JobSearch extends SearchSettings {
  id: string;
  companies: SearchCompany[];
  createdAt: string;
  updatedAt: string;
}

export interface JobSearchSummary {
  id: string;
  name: string;
  enabled: boolean;
  mode: SearchMode;
  runAt: string;
  timeZone: string;
  companyCount: number;
}

/**
 * Companies a new search starts with: remote-first or remote-friendly, hiring across the
 * Americas, with React/TypeScript work. Board names are checked the first time the search runs;
 * the person edits the list freely.
 */
export const suggestedCompanies: readonly z.input<typeof companyBoard>[] = [
  { board: "greenhouse", token: "gitlab", company: "GitLab" },
  { board: "greenhouse", token: "vercel", company: "Vercel" },
  { board: "greenhouse", token: "cloudflare", company: "Cloudflare" },
  { board: "greenhouse", token: "datadog", company: "Datadog" },
  { board: "greenhouse", token: "grafanalabs", company: "Grafana Labs" },
  { board: "greenhouse", token: "elastic", company: "Elastic" },
  { board: "greenhouse", token: "mongodb", company: "MongoDB" },
  { board: "greenhouse", token: "twilio", company: "Twilio" },
  { board: "greenhouse", token: "coinbase", company: "Coinbase" },
  { board: "greenhouse", token: "figma", company: "Figma" },
  { board: "greenhouse", token: "webflow", company: "Webflow" },
  { board: "greenhouse", token: "airtable", company: "Airtable" },
  { board: "greenhouse", token: "postman", company: "Postman" },
  { board: "greenhouse", token: "discord", company: "Discord" },
  { board: "greenhouse", token: "dropbox", company: "Dropbox" },
  { board: "greenhouse", token: "canonical", company: "Canonical" },
  { board: "greenhouse", token: "sourcegraph", company: "Sourcegraph" },
  { board: "lever", token: "kraken", company: "Kraken" },
  { board: "lever", token: "binance", company: "Binance" },
  { board: "lever", token: "plaid", company: "Plaid" },
  { board: "lever", token: "palantir", company: "Palantir" },
  { board: "lever", token: "toptal", company: "Toptal" },
  { board: "ashby", token: "linear", company: "Linear" },
  { board: "ashby", token: "supabase", company: "Supabase" },
  { board: "ashby", token: "posthog", company: "PostHog" },
  { board: "ashby", token: "deel", company: "Deel" },
  { board: "ashby", token: "replit", company: "Replit" },
];

/**
 * The first search, as agreed: remote preferred, open to people in Costa Rica or Latin America,
 * US$60,000 a year ideal and US$50,000 acceptable, all as preferences.
 */
export const defaultSearchSettings: z.input<typeof searchSettingsSchema> = {
  name: "Remote, well paid",
  criteria: {
    titles: {
      values: ["Frontend", "Full Stack", "React", "Software Engineer", "UI Engineer"],
      required: false,
    },
    keywords: {
      include: ["React", "TypeScript", "Accessibility", "Design system", "Testing"],
      exclude: [],
      required: false,
    },
    remote: { value: "remote", required: false },
    regions: {
      values: ["Costa Rica", "Latin America", "Americas", "Anywhere"],
      required: false,
    },
    salary: { ideal: 60_000, minimum: 50_000, currency: "USD", required: false },
    excludedCompanies: [],
  },
  runAt: "08:00",
  timeZone: "America/Costa_Rica",
  mode: "semi",
  minScore: 70,
  dailyLimit: 10,
  enabled: true,
};

/** Each board's public address for a company, to open it from the panel. */
export function boardUrl(board: JobBoard, token: string): string {
  switch (board) {
    case "greenhouse":
      return `https://job-boards.greenhouse.io/${token}`;
    case "lever":
      return `https://jobs.lever.co/${token}`;
    case "ashby":
      return `https://jobs.ashbyhq.com/${token}`;
  }
}
