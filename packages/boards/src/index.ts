import type { BoardPosting, JobBoard } from "@postula/contracts";
import type { BoardRead, JobBoardReader } from "@postula/core";
import { parseAshby, parseGreenhouse, parseLever } from "./parse";

export { parseAshby, parseGreenhouse, parseLever, workplaceFromText } from "./parse";
export { decodeEntities, htmlToText } from "./text";

export interface JobBoardReaderOptions {
  /** Injected in tests. */
  fetch?: typeof globalThis.fetch;
  /** How long one board may take to answer. */
  timeoutMs?: number;
}

const endpoints: Record<
  JobBoard,
  { url: (token: string) => string; parse: (body: unknown, company: string) => BoardPosting[] }
> = {
  greenhouse: {
    url: (token) =>
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`,
    parse: parseGreenhouse,
  },
  lever: {
    url: (token) => `https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`,
    parse: parseLever,
  },
  ashby: {
    url: (token) =>
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}?includeCompensation=true`,
    parse: parseAshby,
  },
};

/**
 * Reads companies' job boards through each ATS's public, documented API (no sign-in, no
 * scraping): Greenhouse's Job Board API, Lever's Postings API and Ashby's Job Posting API.
 */
export function createJobBoardReader({
  fetch = globalThis.fetch,
  timeoutMs = 20_000,
}: JobBoardReaderOptions = {}): JobBoardReader {
  return {
    async read(board, token, company): Promise<BoardRead> {
      const endpoint = endpoints[board];
      let response: Response;
      try {
        response = await fetch(endpoint.url(token), {
          headers: {
            accept: "application/json",
            "user-agent": "Postula (job search for one person)",
          },
          redirect: "follow",
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        return { status: "error", message: error instanceof Error ? error.message : String(error) };
      }
      if (response.status === 404) return { status: "not_found" };
      if (!response.ok) return { status: "error", message: `HTTP ${response.status}` };
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return { status: "error", message: "The board didn't answer JSON" };
      }
      // Lever answers an unknown board with `{ ok: false, error: "Document not found" }`.
      if (board === "lever" && !Array.isArray(body)) return { status: "not_found" };
      // Ashby answers an unknown board without jobs and with `success: false` or an error.
      if (
        board === "ashby" &&
        typeof body === "object" &&
        body !== null &&
        !Array.isArray((body as { jobs?: unknown }).jobs)
      ) {
        return { status: "not_found" };
      }
      return { status: "ok", postings: endpoint.parse(body, company) };
    },
  };
}
