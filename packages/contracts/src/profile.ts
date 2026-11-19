import { z } from "zod/mini";
import { message } from "./message";

/**
 * The master profile: everything true about the person that a CV or a cover letter may say.
 * What an AI writes for a posting can only select, order and reword these items, citing their
 * ids, so nothing is invented.
 */
export const profileItemKinds = [
  "experience",
  "project",
  "achievement",
  "skill_group",
  "education",
  "certification",
  "language",
] as const;
export type ProfileItemKind = (typeof profileItemKinds)[number];

/** The kinds that hang under another item: achievements under a job or a project. */
export const childKinds = ["achievement"] as const satisfies readonly ProfileItemKind[];
/** The items an achievement can belong to. */
export const parentKinds = ["experience", "project"] as const satisfies readonly ProfileItemKind[];

export const profileLocales = ["en", "es"] as const;
export type ProfileLocale = (typeof profileLocales)[number];

export const PROFILE_TEXT_MAX = 200;
export const PROFILE_LONG_TEXT_MAX = 2000;
export const PROFILE_LIST_MAX = 60;
export const PROFILE_ITEMS_MAX = 400;

const requiredText = (max = PROFILE_TEXT_MAX) =>
  z
    .string({ error: message("forms.fieldRequired") })
    .check(
      z.trim(),
      z.minLength(1, message("forms.fieldRequired")),
      z.maxLength(max, message("forms.fieldTooLong")),
    );

const optionalText = (max = PROFILE_TEXT_MAX) =>
  z.optional(
    z.nullable(z.string().check(z.trim(), z.maxLength(max, message("forms.fieldTooLong")))),
  );

/** A month ("2024-03") or a year ("2024"): CVs say no more than that. */
const yearMonth = z.optional(
  z.nullable(
    z
      .string()
      .check(z.trim(), z.regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/, message("forms.yearMonthInvalid"))),
  ),
);

/**
 * A list of short texts. A form sends one text with commas or new lines; an AI sends an array.
 * Both end up as the same trimmed list, without blanks or repeats.
 */
const textList = (min: number) =>
  z.pipe(
    z.pipe(
      z.optional(z.union([z.array(z.string()), z.string()])),
      z.transform((value) => {
        const parts = Array.isArray(value) ? value : (value ?? "").split(/[,\n]/);
        return [...new Set(parts.map((part) => part.trim()).filter(Boolean))];
      }),
    ),
    z
      .array(z.string().check(z.maxLength(PROFILE_TEXT_MAX, message("forms.fieldTooLong"))))
      .check(
        z.minLength(min, message("forms.listRequired")),
        z.maxLength(PROFILE_LIST_MAX, message("forms.listTooLong")),
      ),
  );

export const experienceDataSchema = z.object({
  title: requiredText(),
  organization: requiredText(),
  location: optionalText(),
  start: yearMonth,
  /** Empty while it is the current job. */
  end: yearMonth,
});

export const projectDataSchema = z.object({
  title: requiredText(),
  organization: optionalText(),
  description: optionalText(PROFILE_LONG_TEXT_MAX),
  url: optionalText(),
  stack: textList(0),
  start: yearMonth,
  end: yearMonth,
});

export const achievementDataSchema = z.object({ text: requiredText(PROFILE_LONG_TEXT_MAX) });

export const skillGroupDataSchema = z.object({
  category: requiredText(),
  skills: textList(1),
});

export const educationDataSchema = z.object({
  degree: requiredText(),
  institution: requiredText(),
  start: yearMonth,
  end: yearMonth,
});

export const certificationDataSchema = z.object({
  name: requiredText(),
  issuer: optionalText(),
  year: yearMonth,
});

export const languageDataSchema = z.object({
  language: requiredText(),
  /** As the person says it: "native", "advanced", "C1". */
  level: requiredText(),
});

export const profileItemDataSchemas = {
  experience: experienceDataSchema,
  project: projectDataSchema,
  achievement: achievementDataSchema,
  skill_group: skillGroupDataSchema,
  education: educationDataSchema,
  certification: certificationDataSchema,
  language: languageDataSchema,
} as const satisfies Record<ProfileItemKind, z.ZodMiniType>;

export type ProfileItemData<Kind extends ProfileItemKind = ProfileItemKind> = z.infer<
  (typeof profileItemDataSchemas)[Kind]
>;

const itemId = z.uuid({ error: message("forms.fieldRequired") });

const itemVariant = <Kind extends ProfileItemKind>(kind: Kind) =>
  z.object({
    /** Leave it out to add a new item; send it to change one. */
    id: z.optional(itemId),
    kind: z.literal(kind),
    /** Only for an achievement: the job or project it belongs to. */
    parentId: z.optional(z.nullable(itemId)),
    data: profileItemDataSchemas[kind],
  });

/** Adds an item to the profile or changes one, by kind. */
export const saveProfileItemSchema = z.discriminatedUnion("kind", [
  itemVariant("experience"),
  itemVariant("project"),
  itemVariant("achievement"),
  itemVariant("skill_group"),
  itemVariant("education"),
  itemVariant("certification"),
  itemVariant("language"),
]);
export type SaveProfileItemInput = z.infer<typeof saveProfileItemSchema>;

export const deleteProfileItemSchema = z.object({ id: itemId });
export type DeleteProfileItemInput = z.infer<typeof deleteProfileItemSchema>;

export const moveProfileItemSchema = z.object({
  id: itemId,
  direction: z.enum(["up", "down"]),
});
export type MoveProfileItemInput = z.infer<typeof moveProfileItemSchema>;

/** The head of the profile: who the person is, in one card. */
export const profileHeaderSchema = z.object({
  name: requiredText(80),
  headline: requiredText(),
  location: optionalText(),
  /** LinkedIn, GitHub, a website: one per line in the form. */
  links: textList(0),
  summary: optionalText(PROFILE_LONG_TEXT_MAX),
  /** The language the profile is written in; a posting in the other gets a translated CV. */
  locale: z._default(z.enum(profileLocales), "en"),
});
export type ProfileHeaderInput = z.infer<typeof profileHeaderSchema>;

/**
 * A whole profile at once, as a CV turned into JSON: the header and every item, each with an id
 * of the file's own ("exp-1") that an achievement's `parentId` points to. It replaces what the
 * profile had.
 */
export const importProfileSchema = z.object({
  profile: profileHeaderSchema,
  items: z
    .array(
      z.object({
        id: z.string().check(z.minLength(1)),
        kind: z.enum(profileItemKinds),
        parentId: z.optional(z.nullable(z.string())),
        position: z.optional(z.int().check(z.minimum(0))),
        data: z.record(z.string(), z.unknown()),
      }),
    )
    .check(z.maxLength(PROFILE_ITEMS_MAX)),
});
export type ImportProfileInput = z.infer<typeof importProfileSchema>;

/** The panel pastes the JSON as text; the action parses it into `importProfileSchema`. */
export const importProfileFormSchema = z.object({
  json: z
    .string({ error: message("forms.fieldRequired") })
    .check(z.trim(), z.minLength(2, message("forms.fieldRequired"))),
});

export interface ProfileItem<Kind extends ProfileItemKind = ProfileItemKind> {
  id: string;
  kind: Kind;
  parentId: string | null;
  position: number;
  data: ProfileItemData<Kind>;
}

export interface ProfileHeader {
  name: string;
  headline: string;
  location: string | null;
  links: string[];
  summary: string | null;
  locale: ProfileLocale;
}

export interface MasterProfile {
  /** Null until the person fills in the header or imports a CV. */
  header: ProfileHeader | null;
  items: ProfileItem[];
  /** The saved version matches, scores and documents point to; null for an empty profile. */
  version: { id: string; createdAt: string } | null;
}

/** Whether an item of this kind hangs under another one. */
export function isChildKind(kind: ProfileItemKind): kind is (typeof childKinds)[number] {
  return (childKinds as readonly string[]).includes(kind);
}

export function isParentKind(kind: ProfileItemKind): kind is (typeof parentKinds)[number] {
  return (parentKinds as readonly string[]).includes(kind);
}
