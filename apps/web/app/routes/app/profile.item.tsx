import { type FieldMetadata, getFormProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import {
  isChildKind,
  type ProfileItemKind,
  profileItemKinds,
  saveProfileItemSchema,
} from "@postula/contracts";
import {
  borrarItemPerfil,
  DomainError,
  guardarItemPerfil,
  runOperation,
  verPerfil,
} from "@postula/core";
import { Trash2Icon } from "lucide-react";
import { data, Form, href, Link, redirect, useNavigation } from "react-router";
import { PageHeader } from "~/components/page-header";
import { TextAreaField } from "~/components/text-area-field";
import { TextField } from "~/components/text-field";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { tenantContext } from "~/context";
import { metaT, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { itemFormDefaults, itemName } from "~/lib/profile";
import { coreServices } from "~/lib/services.server";
import type { Route } from "./+types/profile.item";

const isKind = (value: string | null): value is ProfileItemKind =>
  (profileItemKinds as readonly string[]).includes(value ?? "");

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const { items } = await runOperation(
    verPerfil,
    { tenant: context.get(tenantContext), services: coreServices, via: "web" },
    {},
  );
  const i18n = translations(context, "profile", "forms");
  if (params.itemId === "new") {
    const search = new URL(request.url).searchParams;
    const kind = search.get("kind");
    if (!isKind(kind)) throw data("Unknown kind", { status: 404 });
    const parent = isChildKind(kind)
      ? items.find((item) => item.id === search.get("parent"))
      : null;
    if (isChildKind(kind) && !parent) throw data("Unknown parent", { status: 404 });
    return {
      item: null,
      kind,
      parentId: parent?.id ?? null,
      parentName: parent ? itemName(parent) : null,
      defaults: {},
      i18n,
    };
  }
  const item = items.find((entry) => entry.id === params.itemId);
  if (!item) throw data("Profile item not found", { status: 404 });
  const parent = item.parentId ? items.find((entry) => entry.id === item.parentId) : null;
  return {
    item: { id: item.id, name: itemName(item) },
    kind: item.kind,
    parentId: item.parentId,
    parentName: parent ? itemName(parent) : null,
    defaults: itemFormDefaults(item),
    i18n,
  };
}

export function meta({ matches, loaderData }: Route.MetaArgs) {
  if (!loaderData) return [];
  return [{ title: metaT(matches)(titleKey(loaderData.kind, !loaderData.item)) }];
}

export async function action({ request, context }: Route.ActionArgs) {
  const ctx = { tenant: context.get(tenantContext), services: coreServices, via: "web" as const };
  const formData = await request.formData();
  try {
    if (formData.get("intent") === "delete") {
      await runOperation(borrarItemPerfil, ctx, { id: formData.get("id") });
      throw redirect(href("/app/profile"));
    }
    const submission = parseWithZod(formData, { schema: saveProfileItemSchema });
    if (submission.status !== "success") {
      return data({ result: submission.reply() }, { status: 400 });
    }
    await runOperation(guardarItemPerfil, ctx, submission.value);
  } catch (error) {
    if (error instanceof DomainError && error.code === "not_found") {
      throw data("Profile item not found", { status: 404 });
    }
    throw error;
  }
  throw redirect(href("/app/profile"));
}

type Suffix =
  | "Experience"
  | "Project"
  | "Achievement"
  | "SkillGroup"
  | "Education"
  | "Certification"
  | "Language";

const suffixes = {
  experience: "Experience",
  project: "Project",
  achievement: "Achievement",
  skill_group: "SkillGroup",
  education: "Education",
  certification: "Certification",
  language: "Language",
} as const satisfies Record<ProfileItemKind, Suffix>;

function titleKey(kind: ProfileItemKind, isNew: boolean) {
  return `profile.${isNew ? "new" : "edit"}${suffixes[kind]}` as const;
}

type LabelKey =
  | "profile.jobTitleLabel"
  | "profile.organizationLabel"
  | "profile.locationLabel"
  | "profile.startLabel"
  | "profile.endLabel"
  | "profile.dateHint"
  | "profile.endHint"
  | "profile.projectOrganizationLabel"
  | "profile.roleLabel"
  | "profile.descriptionLabel"
  | "profile.urlLabel"
  | "profile.stackLabel"
  | "profile.listHint"
  | "profile.achievementLabel"
  | "profile.achievementHint"
  | "profile.categoryLabel"
  | "profile.skillsLabel"
  | "profile.degreeLabel"
  | "profile.institutionLabel"
  | "profile.certificationLabel"
  | "profile.issuerLabel"
  | "profile.yearLabel"
  | "profile.languageLabel"
  | "profile.levelLabel"
  | "profile.levelHint";

interface FieldConfig {
  name: string;
  label: LabelKey;
  hint?: LabelKey;
  long?: boolean;
  autoComplete?: string;
}

const dates = (end = true): FieldConfig[] => [
  { name: "start", label: "profile.startLabel", hint: "profile.dateHint" },
  ...(end ? [{ name: "end", label: "profile.endLabel", hint: "profile.endHint" } as const] : []),
];

/** What each kind asks for, in the order a CV shows it. */
const fieldsByKind: Record<ProfileItemKind, FieldConfig[]> = {
  experience: [
    { name: "title", label: "profile.jobTitleLabel" },
    { name: "organization", label: "profile.organizationLabel", autoComplete: "organization" },
    { name: "location", label: "profile.locationLabel" },
    ...dates(),
  ],
  project: [
    { name: "organization", label: "profile.projectOrganizationLabel" },
    { name: "title", label: "profile.roleLabel" },
    { name: "description", label: "profile.descriptionLabel", long: true },
    { name: "url", label: "profile.urlLabel" },
    { name: "stack", label: "profile.stackLabel", hint: "profile.listHint", long: true },
    ...dates(),
  ],
  achievement: [
    {
      name: "text",
      label: "profile.achievementLabel",
      hint: "profile.achievementHint",
      long: true,
    },
  ],
  skill_group: [
    { name: "category", label: "profile.categoryLabel" },
    { name: "skills", label: "profile.skillsLabel", hint: "profile.listHint", long: true },
  ],
  education: [
    { name: "degree", label: "profile.degreeLabel" },
    { name: "institution", label: "profile.institutionLabel" },
    ...dates(),
  ],
  certification: [
    { name: "name", label: "profile.certificationLabel" },
    { name: "issuer", label: "profile.issuerLabel" },
    { name: "year", label: "profile.yearLabel", hint: "profile.dateHint" },
  ],
  language: [
    { name: "language", label: "profile.languageLabel" },
    { name: "level", label: "profile.levelLabel", hint: "profile.levelHint" },
  ],
};

const deleteLabels = {
  experience: "profile.deleteExperience",
  project: "profile.deleteProject",
} as const;

export default function ProfileItemPage({ loaderData, actionData }: Route.ComponentProps) {
  const t = useT();
  const navigation = useNavigation();
  const saving =
    navigation.state === "submitting" && navigation.formData?.get("intent") !== "delete";
  const { item, kind, parentId, parentName, defaults } = loaderData;
  const [form, fields] = useForm({
    id: `profile-item-${item?.id ?? "new"}`,
    lastResult: actionData?.result,
    defaultValue: { data: defaults },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: saveProfileItemSchema }),
  });
  const dataFields = fields.data.getFieldset() as unknown as Record<
    string,
    FieldMetadata<string | undefined>
  >;

  return (
    <>
      <PageHeader
        title={t(titleKey(kind, !item))}
        description={parentName ? t("profile.achievementIn", { name: parentName }) : undefined}
      />
      <div className="grid gap-6">
        <Card>
          <CardContent className="pt-6">
            <Form method="post" className="grid gap-4" {...getFormProps(form)}>
              <input type="hidden" name="kind" value={kind} />
              {item ? <input type="hidden" name="id" value={item.id} /> : null}
              {parentId ? <input type="hidden" name="parentId" value={parentId} /> : null}
              {fieldsByKind[kind].map((config) => {
                const field = dataFields[config.name];
                if (!field) return null;
                const props = {
                  field,
                  label: t(config.label),
                  description: config.hint ? t(config.hint) : undefined,
                };
                return config.long ? (
                  <TextAreaField key={config.name} {...props} rows={4} />
                ) : (
                  <TextField key={config.name} {...props} autoComplete={config.autoComplete} />
                );
              })}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button asChild variant="outline">
                  <Link to={href("/app/profile")}>{t("profile.cancel")}</Link>
                </Button>
                <Button type="submit" size="lg" disabled={saving}>
                  {saving ? t("profile.saving") : t("profile.save")}
                </Button>
              </div>
            </Form>
          </CardContent>
        </Card>
        {item ? (
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{t("profile.deleteTitle")}</h2>
              </CardTitle>
              <CardDescription>{t("profile.deleteHint")}</CardDescription>
            </CardHeader>
            <CardContent>
              <details>
                <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">
                  {kind === "experience" || kind === "project"
                    ? t(deleteLabels[kind])
                    : t("profile.deleteOther")}
                </summary>
                <Form method="post" className="pt-2">
                  <input type="hidden" name="id" value={item.id} />
                  <Button type="submit" name="intent" value="delete" variant="destructive">
                    <Trash2Icon aria-hidden />
                    {t("profile.deleteConfirm")}
                  </Button>
                </Form>
              </details>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
