import { describe, expect, it } from "vitest";
import { listPostingsSchema, postingFingerprint } from "./job-posting";

describe("postingFingerprint", () => {
  it("is the same for the same job written differently", () => {
    expect(
      postingFingerprint({
        company: "Acme, Inc.",
        title: "Senior Frontend Engineer",
        location: "Remote – LATAM",
      }),
    ).toBe(
      postingFingerprint({
        company: "acme",
        title: "Senior  Frontend engineer",
        location: "remote latam",
      }),
    );
    expect(
      postingFingerprint({ company: "Señal Labs", title: "Ingeniería", location: "San José" }),
    ).toBe("senal|ingenieria|san jose");
  });

  it("tells apart different titles, companies and places", () => {
    const base = { company: "Acme", title: "Frontend Engineer", location: "Remote" };
    const fingerprint = postingFingerprint(base);
    expect(postingFingerprint({ ...base, title: "Backend Engineer" })).not.toBe(fingerprint);
    expect(postingFingerprint({ ...base, company: "Acme Bank" })).not.toBe(fingerprint);
    expect(postingFingerprint({ ...base, location: "New York" })).not.toBe(fingerprint);
  });
});

describe("listPostingsSchema", () => {
  it("lists the first 50 open postings by default", () => {
    expect(listPostingsSchema.parse({ searchId: "6f1c4a3e-8a8b-4c39-9f7e-2a1f1d6b7c10" })).toEqual({
      searchId: "6f1c4a3e-8a8b-4c39-9f7e-2a1f1d6b7c10",
      status: "open",
      limit: 50,
      offset: 0,
    });
  });
});
