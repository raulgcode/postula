import { createHash } from "node:crypto";
import {
  type ImportProfileInput,
  isChildKind,
  isParentKind,
  type MasterProfile,
  type MoveProfileItemInput,
  PROFILE_ITEMS_MAX,
  type ProfileHeader,
  type ProfileHeaderInput,
  type ProfileItem,
  type ProfileItemKind,
  type ProfileLocale,
  profileItemDataSchemas,
  profileItemKinds,
  type SaveProfileItemInput,
} from "@postula/contracts";
import { and, asc, count, desc, eq, isNull, max, schema } from "@postula/db";
import { DomainError, InvalidProfileError } from "./errors";
import type { TenantContext } from "./tenant";

type Db = TenantContext["db"];
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Db | Tx;

const kindOrder = new Map(profileItemKinds.map((kind, index) => [kind, index]));

/** Items in the order a CV shows them: by section, then by their position. */
export function sortProfileItems<Item extends Pick<ProfileItem, "kind" | "position">>(
  items: Item[],
): Item[] {
  return [...items].sort(
    (a, b) =>
      (kindOrder.get(a.kind) ?? 0) - (kindOrder.get(b.kind) ?? 0) || a.position - b.position,
  );
}

/** JSON with sorted keys, so the same profile always hashes the same. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

async function readHeader(db: Executor, userId: string): Promise<ProfileHeader | null> {
  const [row] = await db.select().from(schema.profile).where(eq(schema.profile.userId, userId));
  if (!row) return null;
  return {
    name: row.name,
    headline: row.headline,
    location: row.location,
    links: row.links,
    summary: row.summary,
    locale: row.locale as ProfileLocale,
  };
}

async function readItems(db: Executor, userId: string): Promise<ProfileItem[]> {
  const rows = await db
    .select({
      id: schema.profileItem.id,
      kind: schema.profileItem.kind,
      parentId: schema.profileItem.parentId,
      position: schema.profileItem.position,
      data: schema.profileItem.data,
    })
    .from(schema.profileItem)
    .where(eq(schema.profileItem.userId, userId));
  return sortProfileItems(rows as ProfileItem[]);
}

/**
 * Saves a copy of the profile if it changed since the last one. Every change to the profile
 * calls it inside its transaction, so a score or a CV always has the exact version it read.
 */
async function recordVersion(db: Executor, userId: string): Promise<void> {
  const header = await readHeader(db, userId);
  const items = await readItems(db, userId);
  if (!header && items.length === 0) return;
  const snapshot = { header, items };
  const hash = createHash("sha256").update(stableStringify(snapshot)).digest("hex");
  const [latest] = await db
    .select({ hash: schema.profileVersion.hash })
    .from(schema.profileVersion)
    .where(eq(schema.profileVersion.userId, userId))
    .orderBy(desc(schema.profileVersion.createdAt))
    .limit(1);
  if (latest?.hash === hash) return;
  await db.insert(schema.profileVersion).values({ userId, snapshot, hash });
}

/** The whole master profile: header, items in CV order and the version they make. */
export async function getProfile(tenant: TenantContext): Promise<MasterProfile> {
  const [header, items, [version]] = await Promise.all([
    readHeader(tenant.db, tenant.userId),
    readItems(tenant.db, tenant.userId),
    tenant.db
      .select({ id: schema.profileVersion.id, createdAt: schema.profileVersion.createdAt })
      .from(schema.profileVersion)
      .where(eq(schema.profileVersion.userId, tenant.userId))
      .orderBy(desc(schema.profileVersion.createdAt))
      .limit(1),
  ]);
  return {
    header,
    items,
    version: version ? { id: version.id, createdAt: version.createdAt.toISOString() } : null,
  };
}

/** One of the person's items, or null when it isn't theirs. */
export async function getProfileItem(
  tenant: TenantContext,
  id: string,
): Promise<ProfileItem | null> {
  const [row] = await tenant.db
    .select({
      id: schema.profileItem.id,
      kind: schema.profileItem.kind,
      parentId: schema.profileItem.parentId,
      position: schema.profileItem.position,
      data: schema.profileItem.data,
    })
    .from(schema.profileItem)
    .where(and(eq(schema.profileItem.id, id), eq(schema.profileItem.userId, tenant.userId)));
  return (row as ProfileItem | undefined) ?? null;
}

function headerValues(input: ProfileHeaderInput, now: Date) {
  return {
    name: input.name,
    headline: input.headline,
    location: input.location ?? null,
    links: input.links,
    summary: input.summary ?? null,
    locale: input.locale,
    updatedAt: now,
  };
}

export async function saveProfileHeader(
  tenant: TenantContext,
  input: ProfileHeaderInput,
  now = new Date(),
): Promise<ProfileHeader> {
  const values = headerValues(input, now);
  await tenant.db.transaction(async (tx) => {
    await tx
      .insert(schema.profile)
      .values({ userId: tenant.userId, ...values })
      .onConflictDoUpdate({ target: schema.profile.userId, set: values });
    await recordVersion(tx, tenant.userId);
  });
  const header = await readHeader(tenant.db, tenant.userId);
  if (!header) throw new Error("The profile header wasn't saved");
  return header;
}

/** Checks that an achievement hangs from one of the person's jobs or projects, and nothing else does. */
async function checkParent(
  db: Executor,
  userId: string,
  kind: ProfileItemKind,
  parentId: string | null,
): Promise<void> {
  if (!isChildKind(kind)) {
    if (parentId) throw new DomainError("parent_not_allowed", `A ${kind} can't have a parent`);
    return;
  }
  if (!parentId) {
    throw new DomainError("parent_required", "An achievement needs the job or project it is from");
  }
  const [parent] = await db
    .select({ kind: schema.profileItem.kind })
    .from(schema.profileItem)
    .where(and(eq(schema.profileItem.id, parentId), eq(schema.profileItem.userId, userId)));
  if (!parent) throw new DomainError("not_found", "The job or project wasn't found");
  if (!isParentKind(parent.kind)) {
    throw new DomainError("parent_not_allowed", `An achievement can't hang from a ${parent.kind}`);
  }
}

const siblingsOf = (userId: string, kind: ProfileItemKind, parentId: string | null) =>
  and(
    eq(schema.profileItem.userId, userId),
    eq(schema.profileItem.kind, kind),
    parentId ? eq(schema.profileItem.parentId, parentId) : isNull(schema.profileItem.parentId),
  );

/** Adds an item at the end of its section (or of its job), or changes one. */
export async function saveProfileItem(
  tenant: TenantContext,
  input: SaveProfileItemInput,
  now = new Date(),
): Promise<ProfileItem> {
  const parentId = input.parentId ?? null;
  const id = await tenant.db.transaction(async (tx) => {
    let itemId = input.id;
    if (itemId) {
      const [current] = await tx
        .select({ kind: schema.profileItem.kind, parentId: schema.profileItem.parentId })
        .from(schema.profileItem)
        .where(
          and(eq(schema.profileItem.id, itemId), eq(schema.profileItem.userId, tenant.userId)),
        );
      if (!current) throw new DomainError("not_found", "The profile item wasn't found");
      if (current.kind !== input.kind) {
        throw new DomainError(
          "kind_mismatch",
          `The item is a ${current.kind}, not a ${input.kind}`,
        );
      }
      // An edit without a parent keeps the one it had.
      const nextParent = input.parentId === undefined ? current.parentId : parentId;
      await checkParent(tx, tenant.userId, input.kind, nextParent);
      await tx
        .update(schema.profileItem)
        .set({ data: input.data, parentId: nextParent, updatedAt: now })
        .where(eq(schema.profileItem.id, itemId));
    } else {
      await checkParent(tx, tenant.userId, input.kind, parentId);
      const [totals] = await tx
        .select({ total: count() })
        .from(schema.profileItem)
        .where(eq(schema.profileItem.userId, tenant.userId));
      if ((totals?.total ?? 0) >= PROFILE_ITEMS_MAX) {
        throw new DomainError("profile_full", `A profile holds up to ${PROFILE_ITEMS_MAX} items`);
      }
      const [lastRow] = await tx
        .select({ last: max(schema.profileItem.position) })
        .from(schema.profileItem)
        .where(siblingsOf(tenant.userId, input.kind, parentId));
      const [row] = await tx
        .insert(schema.profileItem)
        .values({
          userId: tenant.userId,
          kind: input.kind,
          parentId,
          position: lastRow?.last == null ? 0 : lastRow.last + 1,
          data: input.data,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: schema.profileItem.id });
      if (!row) throw new Error("The profile item wasn't saved");
      itemId = row.id;
    }
    await recordVersion(tx, tenant.userId);
    return itemId;
  });
  const item = await getProfileItem(tenant, id);
  if (!item) throw new Error("The profile item wasn't saved");
  return item;
}

/** Deletes an item and, for a job or project, its achievements. */
export async function deleteProfileItem(
  tenant: TenantContext,
  id: string,
): Promise<{ deleted: true }> {
  await tenant.db.transaction(async (tx) => {
    const deleted = await tx
      .delete(schema.profileItem)
      .where(and(eq(schema.profileItem.id, id), eq(schema.profileItem.userId, tenant.userId)))
      .returning({ id: schema.profileItem.id });
    if (deleted.length === 0) throw new DomainError("not_found", "The profile item wasn't found");
    await recordVersion(tx, tenant.userId);
  });
  return { deleted: true };
}

/** Moves an item one place up or down inside its section (or its job). */
export async function moveProfileItem(
  tenant: TenantContext,
  input: MoveProfileItemInput,
): Promise<ProfileItem[]> {
  await tenant.db.transaction(async (tx) => {
    const [item] = await tx
      .select({ kind: schema.profileItem.kind, parentId: schema.profileItem.parentId })
      .from(schema.profileItem)
      .where(
        and(eq(schema.profileItem.id, input.id), eq(schema.profileItem.userId, tenant.userId)),
      );
    if (!item) throw new DomainError("not_found", "The profile item wasn't found");
    const siblings = await tx
      .select({ id: schema.profileItem.id })
      .from(schema.profileItem)
      .where(siblingsOf(tenant.userId, item.kind, item.parentId))
      .orderBy(asc(schema.profileItem.position), asc(schema.profileItem.createdAt))
      .for("update");
    const order = siblings.map((sibling) => sibling.id);
    const from = order.indexOf(input.id);
    const to = input.direction === "up" ? from - 1 : from + 1;
    if (to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to] as string, order[from] as string];
    for (const [position, id] of order.entries()) {
      await tx.update(schema.profileItem).set({ position }).where(eq(schema.profileItem.id, id));
    }
    await recordVersion(tx, tenant.userId);
  });
  return readItems(tenant.db, tenant.userId);
}

/**
 * Replaces the whole profile with one from a file (a CV turned into JSON). Each item is checked
 * against its kind's schema, and an achievement must point to a job or project in the same
 * file. Nothing changes if anything is wrong.
 */
export async function importProfile(
  tenant: TenantContext,
  input: ImportProfileInput,
  now = new Date(),
): Promise<MasterProfile> {
  const items = input.items.map((item, index) => {
    const parsed = profileItemDataSchemas[item.kind].safeParse(item.data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new InvalidProfileError(
        item.id,
        `Item "${item.id}" (${item.kind}): ${issue?.path.join(".") || "data"} ${issue?.message ?? "is invalid"}`,
      );
    }
    return { ...item, data: parsed.data, order: item.position ?? index };
  });
  const byFileId = new Map(items.map((item) => [item.id, item]));
  if (byFileId.size !== items.length) {
    throw new InvalidProfileError(null, "Two items have the same id");
  }
  for (const item of items) {
    const parent = item.parentId ? byFileId.get(item.parentId) : undefined;
    if (isChildKind(item.kind)) {
      if (!parent || !isParentKind(parent.kind)) {
        throw new InvalidProfileError(
          item.id,
          `Achievement "${item.id}" must point to a job or project in the file`,
        );
      }
    } else if (item.parentId) {
      throw new InvalidProfileError(
        item.id,
        `Item "${item.id}" (${item.kind}) can't have a parent`,
      );
    }
  }

  await tenant.db.transaction(async (tx) => {
    const header = headerValues(input.profile, now);
    await tx
      .insert(schema.profile)
      .values({ userId: tenant.userId, ...header })
      .onConflictDoUpdate({ target: schema.profile.userId, set: header });
    await tx.delete(schema.profileItem).where(eq(schema.profileItem.userId, tenant.userId));
    const ids = new Map<string, string>();
    // Parents first, so each achievement can point to its new id.
    for (const item of sortProfileItems(
      items.map((entry) => ({ ...entry, position: entry.order })),
    ).sort((a, b) => Number(isChildKind(a.kind)) - Number(isChildKind(b.kind)))) {
      const [row] = await tx
        .insert(schema.profileItem)
        .values({
          userId: tenant.userId,
          kind: item.kind,
          parentId: item.parentId ? (ids.get(item.parentId) ?? null) : null,
          position: item.order,
          data: item.data,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: schema.profileItem.id });
      if (!row) throw new Error("The profile item wasn't saved");
      ids.set(item.id, row.id);
    }
    await recordVersion(tx, tenant.userId);
  });
  return getProfile(tenant);
}
