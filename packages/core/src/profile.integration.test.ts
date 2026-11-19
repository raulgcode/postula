import { eq, schema } from "@postula/db";
import { createTestDatabase, createTestTenant } from "@postula/db/testing";
import { afterAll, describe, expect, it } from "vitest";
import { DomainError } from "./errors";
import {
  deleteProfileItem,
  getProfile,
  importProfile,
  moveProfileItem,
  saveProfileHeader,
  saveProfileItem,
} from "./profile";
import type { TenantContext } from "./tenant";

const connection = createTestDatabase();
afterAll(() => connection.close());
const db = connection.db;

async function tenant(): Promise<TenantContext> {
  const { userId } = await createTestTenant(db);
  return { db, userId };
}

const header = {
  name: "Raúl González",
  headline: "Full Stack Software Engineer",
  location: "Alajuela, Costa Rica",
  links: ["github.com/raulgcode"],
  summary: "Ten years building web apps.",
  locale: "en" as const,
};

async function versions(ctx: TenantContext) {
  return db
    .select({ id: schema.profileVersion.id })
    .from(schema.profileVersion)
    .where(eq(schema.profileVersion.userId, ctx.userId));
}

const job = (title: string) =>
  ({ kind: "experience", data: { title, organization: "Acme", start: "2020-01" } }) as const;

describe("Master profile", () => {
  it("starts empty, without a version", async () => {
    expect(await getProfile(await tenant())).toEqual({ header: null, items: [], version: null });
  });

  it("saves the header and makes a version only when something changed", async () => {
    const ctx = await tenant();
    await saveProfileHeader(ctx, header);
    await saveProfileHeader(ctx, header);
    const profile = await getProfile(ctx);

    expect(profile.header).toEqual(header);
    expect(profile.version).not.toBeNull();
    expect(await versions(ctx)).toHaveLength(1);

    await saveProfileHeader(ctx, { ...header, headline: "Frontend Engineer" });
    expect(await versions(ctx)).toHaveLength(2);
  });

  it("adds items at the end of their section and an achievement under its job", async () => {
    const ctx = await tenant();
    const first = await saveProfileItem(ctx, job("Engineer"));
    const second = await saveProfileItem(ctx, job("Senior Engineer"));
    const achievement = await saveProfileItem(ctx, {
      kind: "achievement",
      parentId: first.id,
      data: { text: "Cut build times in half." },
    });

    expect([first.position, second.position]).toEqual([0, 1]);
    expect(achievement).toMatchObject({ parentId: first.id, position: 0 });
    expect((await getProfile(ctx)).items.map((item) => item.kind)).toEqual([
      "experience",
      "experience",
      "achievement",
    ]);
  });

  it("refuses an achievement without a job, or under a skill group", async () => {
    const ctx = await tenant();
    await expect(
      saveProfileItem(ctx, { kind: "achievement", data: { text: "Shipped it." } }),
    ).rejects.toMatchObject({ code: "parent_required" });

    const skills = await saveProfileItem(ctx, {
      kind: "skill_group",
      data: { category: "Frontend", skills: ["React"] },
    });
    await expect(
      saveProfileItem(ctx, { kind: "achievement", parentId: skills.id, data: { text: "x" } }),
    ).rejects.toMatchObject({ code: "parent_not_allowed" });
  });

  it("changes an item without moving it, and refuses to change its kind", async () => {
    const ctx = await tenant();
    const item = await saveProfileItem(ctx, job("Engineer"));
    const changed = await saveProfileItem(ctx, { ...job("Staff Engineer"), id: item.id });
    expect(changed).toMatchObject({ id: item.id, position: 0, data: { title: "Staff Engineer" } });

    await expect(
      saveProfileItem(ctx, {
        id: item.id,
        kind: "language",
        data: { language: "Spanish", level: "native" },
      }),
    ).rejects.toMatchObject({ code: "kind_mismatch" });
  });

  it("moves an item up and keeps the order at the ends", async () => {
    const ctx = await tenant();
    const a = await saveProfileItem(ctx, job("A"));
    const b = await saveProfileItem(ctx, job("B"));
    await moveProfileItem(ctx, { id: b.id, direction: "up" });
    await moveProfileItem(ctx, { id: b.id, direction: "up" });

    const titles = (await getProfile(ctx)).items.map(
      (item) => (item.data as { title: string }).title,
    );
    expect(titles).toEqual(["B", "A"]);
    expect(a.id).not.toBe(b.id);
  });

  it("deletes a job with its achievements", async () => {
    const ctx = await tenant();
    const item = await saveProfileItem(ctx, job("Engineer"));
    await saveProfileItem(ctx, { kind: "achievement", parentId: item.id, data: { text: "x" } });
    await deleteProfileItem(ctx, item.id);
    expect((await getProfile(ctx)).items).toEqual([]);
  });

  it("imports a whole CV, replacing what was there and linking achievements to their jobs", async () => {
    const ctx = await tenant();
    await saveProfileItem(ctx, job("Old job"));
    const profile = await importProfile(ctx, {
      profile: header,
      items: [
        { id: "exp-1", kind: "experience", data: { title: "Engineer", organization: "Micro1" } },
        { id: "exp-1-a1", kind: "achievement", parentId: "exp-1", data: { text: "Built agents." } },
        {
          id: "skills-1",
          kind: "skill_group",
          data: { category: "Frontend", skills: ["React", "TypeScript"] },
        },
        { id: "lang-es", kind: "language", data: { language: "Spanish", level: "native" } },
      ],
    });

    expect(profile.header).toEqual(header);
    expect(profile.items).toHaveLength(4);
    const [experience, achievement] = profile.items;
    expect(experience?.data).toMatchObject({ title: "Engineer" });
    expect(achievement).toMatchObject({ kind: "achievement", parentId: experience?.id });
  });

  it("imports nothing when an item is wrong", async () => {
    const ctx = await tenant();
    await saveProfileItem(ctx, job("Kept"));
    const attempt = importProfile(ctx, {
      profile: header,
      items: [{ id: "a", kind: "achievement", parentId: "nowhere", data: { text: "x" } }],
    });
    await expect(attempt).rejects.toBeInstanceOf(DomainError);
    expect((await getProfile(ctx)).items).toHaveLength(1);
  });

  it("never shows or touches another person's profile", async () => {
    const owner = await tenant();
    const stranger = await tenant();
    await saveProfileHeader(owner, header);
    const item = await saveProfileItem(owner, job("Engineer"));

    expect(await getProfile(stranger)).toEqual({ header: null, items: [], version: null });
    await expect(
      saveProfileItem(stranger, { ...job("Hijacked"), id: item.id }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(deleteProfileItem(stranger, item.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(moveProfileItem(stranger, { id: item.id, direction: "up" })).rejects.toMatchObject(
      { code: "not_found" },
    );
    await expect(
      saveProfileItem(stranger, { kind: "achievement", parentId: item.id, data: { text: "x" } }),
    ).rejects.toMatchObject({ code: "not_found" });
    expect((await getProfile(owner)).items).toHaveLength(1);
  });
});
