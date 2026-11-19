import {
  type BoardPosting,
  POSTING_DESCRIPTION_MAX,
  type PostingSalary,
  type SalaryInterval,
  type Workplace,
} from "@postula/contracts";
import { decodeEntities, htmlToText } from "./text";

/**
 * Each board's public listing, turned into Postula's `BoardPosting`. Fields are read defensively:
 * a board that leaves one out, or changes its type, gives an empty value instead of an error,
 * and a posting without an id, a title or a link is skipped.
 */

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const textOrNull = (value: unknown): string | null => text(value) || null;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const httpUrl = (value: unknown): string | null => {
  const url = text(value);
  return /^https?:\/\//i.test(url) ? url : null;
};
const isoDate = (value: unknown): string | null => {
  const date =
    typeof value === "number" ? new Date(value) : text(value) ? new Date(text(value)) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
};

/** "Remote – LATAM" says remote even when the board has no field for it. */
export function workplaceFromText(...texts: string[]): Workplace {
  const all = texts.join(" ").toLowerCase();
  if (/\bhybrid\b|\bhíbrido\b/.test(all)) return "hybrid";
  if (/\bremote\b|\bremoto\b|\banywhere\b|\bwork from home\b/.test(all)) return "remote";
  return "unknown";
}

function description(value: string): string {
  return htmlToText(value).slice(0, POSTING_DESCRIPTION_MAX);
}

function intervalOf(value: unknown): SalaryInterval | null {
  const interval = text(value).toLowerCase();
  if (/year|annual|annum/.test(interval)) return "year";
  if (/month/.test(interval)) return "month";
  if (/hour/.test(interval)) return "hour";
  return null;
}

const amount = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;

/** GET boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true */
export function parseGreenhouse(body: unknown, company: string): BoardPosting[] {
  if (!isObject(body)) return [];
  return list(body.jobs).flatMap((job): BoardPosting[] => {
    if (!isObject(job)) return [];
    const externalId = typeof job.id === "number" ? String(job.id) : text(job.id);
    const title = text(job.title);
    const url = httpUrl(job.absolute_url);
    if (!externalId || !title || !url) return [];
    const location = isObject(job.location) ? text(job.location.name) : "";
    const offices = list(job.offices)
      .map((office) => (isObject(office) ? text(office.name) : ""))
      .filter(Boolean);
    const departments = list(job.departments)
      .map((department) => (isObject(department) ? text(department.name) : ""))
      .filter(Boolean);
    return [
      {
        externalId,
        title,
        company,
        location: location || offices.join(", "),
        workplace: workplaceFromText(location, ...offices),
        url,
        applyUrl: null,
        // `content` is HTML escaped once: decode, then drop the tags.
        description: description(decodeEntities(text(job.content))),
        publishedAt: isoDate(job.first_published) ?? isoDate(job.updated_at),
        salary: null,
        department: departments[0] ?? null,
        employmentType: null,
      },
    ];
  });
}

function leverSalary(range: unknown): PostingSalary | null {
  if (!isObject(range)) return null;
  const min = amount(range.min);
  const max = amount(range.max);
  if (min === null && max === null) return null;
  return { min, max, currency: textOrNull(range.currency), interval: intervalOf(range.interval) };
}

function leverWorkplace(value: unknown, location: string): Workplace {
  switch (text(value).toLowerCase()) {
    case "remote":
      return "remote";
    case "hybrid":
      return "hybrid";
    case "on-site":
    case "onsite":
      return "onsite";
    default:
      return workplaceFromText(location);
  }
}

/** GET api.lever.co/v0/postings/{token}?mode=json */
export function parseLever(body: unknown, company: string): BoardPosting[] {
  return list(body).flatMap((job): BoardPosting[] => {
    if (!isObject(job)) return [];
    const externalId = text(job.id);
    const title = text(job.text);
    const url = httpUrl(job.hostedUrl);
    if (!externalId || !title || !url) return [];
    const categories = isObject(job.categories) ? job.categories : {};
    const allLocations = list(categories.allLocations).map(text).filter(Boolean);
    const location = text(categories.location) || allLocations.join(", ");
    const lists = list(job.lists)
      .map((entry) =>
        isObject(entry) ? `<h3>${text(entry.text)}</h3><ul>${text(entry.content)}</ul>` : "",
      )
      .join("");
    const html = [text(job.description), lists, text(job.additional)].join("");
    return [
      {
        externalId,
        title,
        company,
        location,
        workplace: leverWorkplace(job.workplaceType, location),
        url,
        applyUrl: httpUrl(job.applyUrl),
        description: html ? description(html) : text(job.descriptionPlain),
        publishedAt: isoDate(job.createdAt),
        salary: leverSalary(job.salaryRange),
        department: textOrNull(categories.department) ?? textOrNull(categories.team),
        employmentType: textOrNull(categories.commitment),
      },
    ];
  });
}

function ashbyWorkplace(job: Json, location: string): Workplace {
  switch (text(job.workplaceType).toLowerCase()) {
    case "remote":
      return "remote";
    case "hybrid":
      return "hybrid";
    case "onsite":
      return "onsite";
    default:
      return job.isRemote === true ? "remote" : workplaceFromText(location);
  }
}

function ashbySalary(compensation: unknown): PostingSalary | null {
  if (!isObject(compensation)) return null;
  const components = [
    ...list(compensation.summaryComponents),
    ...list(compensation.compensationTiers).flatMap((tier) =>
      isObject(tier) ? list(tier.components) : [],
    ),
  ].filter(isObject);
  const salary = components.find((component) => /salary/i.test(text(component.compensationType)));
  if (!salary) return null;
  const min = amount(salary.minValue);
  const max = amount(salary.maxValue);
  if (min === null && max === null) return null;
  return {
    min,
    max,
    currency: textOrNull(salary.currencyCode),
    interval: intervalOf(salary.interval),
  };
}

/** GET api.ashbyhq.com/posting-api/job-board/{token}?includeCompensation=true */
export function parseAshby(body: unknown, company: string): BoardPosting[] {
  if (!isObject(body)) return [];
  return list(body.jobs).flatMap((job): BoardPosting[] => {
    if (!isObject(job) || job.isListed === false) return [];
    const url = httpUrl(job.jobUrl);
    const title = text(job.title);
    // Ashby's docs don't promise an `id`; the posting's address is unique on its board.
    const externalId = text(job.id) || url?.split("/").filter(Boolean).at(-1) || "";
    if (!externalId || !title || !url) return [];
    const secondary = list(job.secondaryLocations)
      .map((entry) => (isObject(entry) ? text(entry.location) : ""))
      .filter(Boolean);
    const location = [text(job.location), ...secondary].filter(Boolean).join(", ");
    return [
      {
        externalId,
        title,
        company,
        location,
        workplace: ashbyWorkplace(job, location),
        url,
        applyUrl: httpUrl(job.applyUrl),
        description: text(job.descriptionHtml)
          ? description(text(job.descriptionHtml))
          : text(job.descriptionPlain).slice(0, POSTING_DESCRIPTION_MAX),
        publishedAt: isoDate(job.publishedAt),
        salary: ashbySalary(job.compensation) ?? ashbySalary(body.compensation),
        department: textOrNull(job.department) ?? textOrNull(job.team),
        employmentType: textOrNull(job.employmentType),
      },
    ];
  });
}
