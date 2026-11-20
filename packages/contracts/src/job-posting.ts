import { z } from "zod/mini";
import type { JobBoard } from "./job-search";
import { message } from "./message";
import type { SetAsideReason } from "./posting-filter";

/** Where the work happens, as each board says it (or `unknown` when it doesn't). */
export const workplaces = ["remote", "hybrid", "onsite", "unknown"] as const;
export type Workplace = (typeof workplaces)[number];

export const salaryIntervals = ["year", "month", "hour"] as const;
export type SalaryInterval = (typeof salaryIntervals)[number];

export interface PostingSalary {
  min: number | null;
  max: number | null;
  currency: string | null;
  interval: SalaryInterval | null;
}

export const POSTING_DESCRIPTION_MAX = 30_000;

/** A posting as a board gives it, already in Postula's shape: one per board and posting id. */
export interface BoardPosting {
  /** The board's own id: with the board and its name, what makes a posting the same posting. */
  externalId: string;
  title: string;
  company: string;
  location: string;
  workplace: Workplace;
  /** The posting's page on the board. */
  url: string;
  /** Where to apply, when the board gives a separate one. */
  applyUrl: string | null;
  /** Plain text, without HTML, at most `POSTING_DESCRIPTION_MAX` characters. */
  description: string;
  publishedAt: string | null;
  salary: PostingSalary | null;
  department: string | null;
  employmentType: string | null;
}

/** A posting Postula found for the person. */
export interface JobPosting extends BoardPosting {
  id: string;
  board: JobBoard;
  token: string;
  firstSeenAt: string;
  lastSeenAt: string;
  /** When it disappeared from its board (the company closed it), or null while it's open. */
  closedAt: string | null;
  /** The same job already found on another board or under another id: shown only once. */
  duplicateOfId: string | null;
}

export type JobPostingSummary = Omit<JobPosting, "description"> & {
  /** Why this search sets it aside (what it marked required); empty when it's in the list. */
  setAsideReasons: SetAsideReason[];
};

/** How a run of a search went, company by company. */
export interface SearchRun {
  id: string;
  searchId: string;
  via: string;
  status: "running" | "ok" | "partial" | "failed";
  /** The day in the search's time zone, for the daily run; null for "Search now". */
  scheduledFor: string | null;
  startedAt: string;
  finishedAt: string | null;
  /** Open postings the boards listed. */
  found: number;
  /** Postings Postula hadn't seen before. */
  added: number;
  /** Postings that left their board since the last run. */
  closed: number;
  errors: { board: JobBoard; token: string; company: string; reason: "not_found" | "error" }[];
}

const searchId = z.uuid({ error: message("forms.fieldRequired") });

export const runSearchSchema = z.object({ id: searchId });

export const listPostingsSchema = z.object({
  searchId,
  /**
   * `open` (default): open postings that meet what the search requires, without duplicates.
   * `set_aside`: open postings that don't, each with its reasons. `all`: everything, also closed
   * postings and duplicates.
   */
  status: z._default(z.enum(["open", "set_aside", "all"]), "open"),
  limit: z._default(z.number().check(z.int(), z.minimum(1), z.maximum(200)), 50),
  offset: z._default(z.number().check(z.int(), z.minimum(0)), 0),
});
export type ListPostingsInput = z.infer<typeof listPostingsSchema>;

export const postingIdSchema = z.object({ id: z.uuid({ error: message("forms.fieldRequired") }) });

const words = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Endings that don't make a different company: "Acme, Inc." is Acme. */
const companySuffixes = /\b(inc|llc|ltd|limited|gmbh|corp|corporation|co|sa|s a|bv|plc|labs)$/;

/**
 * The same job on two boards, or posted twice: same company, same title and same place once
 * spelling, accents, punctuation and "Inc." are set aside.
 */
export function postingFingerprint(posting: Pick<BoardPosting, "company" | "title" | "location">) {
  let company = words(posting.company);
  while (companySuffixes.test(company)) company = company.replace(companySuffixes, "").trim();
  return [company, words(posting.title), words(posting.location)].join("|");
}
