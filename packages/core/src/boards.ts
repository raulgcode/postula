import type { BoardPosting, JobBoard } from "@postula/contracts";

/** What reading one company's public job board gave. */
export type BoardRead =
  | { status: "ok"; postings: BoardPosting[] }
  /** The board doesn't exist under that name (a typo, or the company moved to another ATS). */
  | { status: "not_found" }
  /** The board didn't answer or answered something Postula can't read; it's tried next run. */
  | { status: "error"; message: string };

/**
 * Reads companies' public job boards (Greenhouse, Lever, Ashby): `@postula/boards` over HTTP,
 * a fake in tests. Only those boards' public APIs, never LinkedIn or a scraped page.
 */
export interface JobBoardReader {
  read(board: JobBoard, token: string, company: string): Promise<BoardRead>;
}
