import { describe, expect, it } from "vitest";
import { createJobBoardReader } from "./index";
import { parseAshby, parseGreenhouse, parseLever, workplaceFromText } from "./parse";
import { htmlToText } from "./text";

// Shapes as each ATS documents its public listing (Greenhouse Job Board API, Lever Postings
// API, Ashby Job Posting API).
const greenhouse = {
  jobs: [
    {
      id: 4012345,
      internal_job_id: 99,
      title: "Senior Frontend Engineer",
      updated_at: "2026-11-10T09:00:00-05:00",
      requisition_id: "ENG-1",
      location: { name: "Remote - Americas" },
      absolute_url: "https://job-boards.greenhouse.io/acme/jobs/4012345",
      language: "en",
      metadata: null,
      content:
        "&lt;p&gt;Build &lt;strong&gt;accessible&lt;/strong&gt; apps.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;React&lt;/li&gt;&lt;li&gt;TypeScript&lt;/li&gt;&lt;/ul&gt;",
      departments: [{ id: 1, name: "Engineering", parent_id: null, child_ids: [] }],
      offices: [{ id: 2, name: "Remote", location: "", parent_id: null, child_ids: [] }],
    },
    { id: 5, title: "", absolute_url: "https://example.com" },
  ],
  meta: { total: 2 },
};

const lever = [
  {
    id: "a1b2c3",
    text: "Full Stack Engineer",
    hostedUrl: "https://jobs.lever.co/acme/a1b2c3",
    applyUrl: "https://jobs.lever.co/acme/a1b2c3/apply",
    categories: {
      location: "San José, Costa Rica",
      commitment: "Full-time",
      team: "Platform",
      department: "Engineering",
      allLocations: ["San José, Costa Rica"],
    },
    workplaceType: "hybrid",
    country: "CR",
    createdAt: 1_762_000_000_000,
    description: "<div>We ship every day.</div>",
    descriptionPlain: "We ship every day.",
    lists: [{ text: "What you'll do", content: "<li>Own features</li><li>Review code</li>" }],
    additional: "<div>Benefits &amp; more</div>",
    salaryRange: { min: 50000, max: 70000, currency: "USD", interval: "per-year-salary" },
  },
];

const ashby = {
  apiVersion: "1",
  jobs: [
    {
      id: "3f6e-11",
      title: "Product Engineer",
      location: "Remote",
      secondaryLocations: [{ location: "Mexico City", address: { addressCountry: "MX" } }],
      department: "Engineering",
      team: "Growth",
      isListed: true,
      isRemote: true,
      workplaceType: "Remote",
      employmentType: "FullTime",
      publishedAt: "2026-11-12T15:30:00.000Z",
      jobUrl: "https://jobs.ashbyhq.com/acme/3f6e-11",
      applyUrl: "https://jobs.ashbyhq.com/acme/3f6e-11/application",
      descriptionHtml: "<p>Work on <em>Linear-like</em> tools.</p>",
      descriptionPlain: "Work on Linear-like tools.",
      compensation: {
        compensationTierSummary: "$60K – $80K",
        summaryComponents: [
          {
            compensationType: "Salary",
            interval: "1 YEAR",
            currencyCode: "USD",
            minValue: 60000,
            maxValue: 80000,
          },
        ],
      },
    },
    {
      title: "Hidden",
      isListed: false,
      jobUrl: "https://jobs.ashbyhq.com/acme/hidden",
    },
  ],
};

describe("parseGreenhouse", () => {
  it("decodes the escaped HTML and reads remote from the location", () => {
    const [posting, ...rest] = parseGreenhouse(greenhouse, "Acme");
    expect(rest).toEqual([]);
    expect(posting).toEqual({
      externalId: "4012345",
      title: "Senior Frontend Engineer",
      company: "Acme",
      location: "Remote - Americas",
      workplace: "remote",
      url: "https://job-boards.greenhouse.io/acme/jobs/4012345",
      applyUrl: null,
      description: "Build accessible apps.\n\n• React\n• TypeScript",
      publishedAt: "2026-11-10T14:00:00.000Z",
      salary: null,
      department: "Engineering",
      employmentType: null,
    });
  });

  it("gives nothing for a body it doesn't know", () => {
    expect(parseGreenhouse(null, "Acme")).toEqual([]);
    expect(parseGreenhouse({ jobs: "nope" }, "Acme")).toEqual([]);
  });
});

describe("parseLever", () => {
  it("reads the workplace, the lists and a year's salary", () => {
    const [posting] = parseLever(lever, "Acme");
    expect(posting).toMatchObject({
      externalId: "a1b2c3",
      title: "Full Stack Engineer",
      location: "San José, Costa Rica",
      workplace: "hybrid",
      applyUrl: "https://jobs.lever.co/acme/a1b2c3/apply",
      publishedAt: new Date(1_762_000_000_000).toISOString(),
      salary: { min: 50000, max: 70000, currency: "USD", interval: "year" },
      department: "Engineering",
      employmentType: "Full-time",
    });
    expect(posting?.description).toBe(
      "We ship every day.\nWhat you'll do\n\n• Own features\n• Review code\nBenefits & more",
    );
  });
});

describe("parseAshby", () => {
  it("reads compensation and skips unlisted postings", () => {
    const postings = parseAshby(ashby, "Acme");
    expect(postings).toHaveLength(1);
    expect(postings[0]).toMatchObject({
      externalId: "3f6e-11",
      location: "Remote, Mexico City",
      workplace: "remote",
      description: "Work on Linear-like tools.",
      salary: { min: 60000, max: 80000, currency: "USD", interval: "year" },
      employmentType: "FullTime",
    });
  });
});

describe("text helpers", () => {
  it("drops scripts and tags, keeping lines", () => {
    expect(htmlToText("<script>alert(1)</script><h2>Role</h2><p>One&nbsp;two</p>")).toBe(
      "Role\nOne two",
    );
  });

  it("reads remote and hybrid from words", () => {
    expect(workplaceFromText("Remoto, Costa Rica")).toBe("remote");
    expect(workplaceFromText("New York (Hybrid)")).toBe("hybrid");
    expect(workplaceFromText("Berlin")).toBe("unknown");
  });
});

describe("createJobBoardReader", () => {
  const answering = (status: number, body: unknown) =>
    (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;

  it("calls each board's public API and parses it", async () => {
    const urls: string[] = [];
    const reader = createJobBoardReader({
      fetch: (async (url: string) => {
        urls.push(String(url));
        return new Response(JSON.stringify(greenhouse), { status: 200 });
      }) as typeof fetch,
    });
    const read = await reader.read("greenhouse", "acme", "Acme");
    expect(read.status).toBe("ok");
    expect(urls).toEqual(["https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true"]);
  });

  it("tells a missing board from one that failed", async () => {
    expect(
      await createJobBoardReader({ fetch: answering(404, {}) }).read("greenhouse", "x", "X"),
    ).toEqual({ status: "not_found" });
    expect(
      await createJobBoardReader({ fetch: answering(200, { ok: false }) }).read("lever", "x", "X"),
    ).toEqual({ status: "not_found" });
    expect(
      await createJobBoardReader({ fetch: answering(503, {}) }).read("ashby", "x", "X"),
    ).toEqual({ status: "error", message: "HTTP 503" });
    const offline = createJobBoardReader({
      fetch: (async () => {
        throw new Error("getaddrinfo ENOTFOUND");
      }) as typeof fetch,
    });
    expect(await offline.read("lever", "x", "X")).toEqual({
      status: "error",
      message: "getaddrinfo ENOTFOUND",
    });
  });
});
