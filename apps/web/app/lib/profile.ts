import type { ProfileItem, ProfileItemKind } from "@postula/contracts";
import type { T } from "~/lib/i18n";

/** The sections of the profile page, in CV order; achievements show inside their job. */
export const profileSections = [
  "experience",
  "project",
  "skill_group",
  "education",
  "certification",
  "language",
] as const satisfies readonly ProfileItemKind[];

const text = (value: unknown) => (typeof value === "string" ? value : "");
const list = (value: unknown) => (Array.isArray(value) ? value.join(", ") : "");

/** The name an item goes by in a list, a button label or a title. */
export function itemName(item: Pick<ProfileItem, "kind" | "data">): string {
  const data = item.data as Record<string, unknown>;
  switch (item.kind) {
    case "experience":
    case "project":
      return [text(data.title), text(data.organization)].filter(Boolean).join(" · ");
    case "achievement":
      return text(data.text);
    case "skill_group":
      return text(data.category);
    case "education":
      return text(data.degree);
    case "certification":
      return text(data.name);
    case "language":
      return text(data.language);
  }
}

/** The second line of an item: dates, the school, the skills. */
export function itemDetail(item: Pick<ProfileItem, "kind" | "data">, t: T): string {
  const data = item.data as Record<string, unknown>;
  const dates = () => {
    const start = text(data.start);
    const end = text(data.end);
    if (!start && !end) return "";
    return `${start || "…"} – ${end || t("profile.present")}`;
  };
  switch (item.kind) {
    case "experience":
      return [text(data.location), dates()].filter(Boolean).join(" · ");
    case "project":
      return [text(data.description), list(data.stack)].filter(Boolean).join(" · ");
    case "skill_group":
      return list(data.skills);
    case "education":
      return [text(data.institution), dates()].filter(Boolean).join(" · ");
    case "certification":
      return [text(data.issuer), text(data.year)].filter(Boolean).join(" · ");
    case "language":
      return text(data.level);
    case "achievement":
      return "";
  }
}

/** A saved item as its form's default values: lists become one text, a line each. */
export function itemFormDefaults(item: Pick<ProfileItem, "data">): Record<string, string> {
  return Object.fromEntries(
    Object.entries(item.data as Record<string, unknown>).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.join("\n") : text(value),
    ]),
  );
}
