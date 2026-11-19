import { getFormProps, getInputProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { profileHeaderSchema, profileLocales } from "@postula/contracts";
import { editarPerfil, runOperation, verPerfil } from "@postula/core";
import { data, Form, href, Link, redirect, useNavigation } from "react-router";
import { PageHeader } from "~/components/page-header";
import { TextAreaField } from "~/components/text-area-field";
import { FieldErrors, TextField } from "~/components/text-field";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { tenantContext } from "~/context";
import { metaT, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { coreServices } from "~/lib/services.server";
import type { Route } from "./+types/profile.edit";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: metaT(matches)("profile.headerTitle") }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const { header } = await runOperation(
    verPerfil,
    { tenant: context.get(tenantContext), services: coreServices, via: "web" },
    {},
  );
  return { header, i18n: translations(context, "profile", "forms") };
}

export async function action({ request, context }: Route.ActionArgs) {
  const submission = parseWithZod(await request.formData(), { schema: profileHeaderSchema });
  if (submission.status !== "success") {
    return data({ result: submission.reply() }, { status: 400 });
  }
  await runOperation(
    editarPerfil,
    { tenant: context.get(tenantContext), services: coreServices, via: "web" },
    submission.value,
  );
  throw redirect(href("/app/profile"));
}

const localeLabels = { en: "profile.localeEn", es: "profile.localeEs" } as const;

export default function EditProfileHeader({ loaderData, actionData }: Route.ComponentProps) {
  const t = useT();
  const navigation = useNavigation();
  const saving = navigation.state === "submitting";
  const { header } = loaderData;
  const [form, fields] = useForm({
    id: "profile-header",
    lastResult: actionData?.result,
    defaultValue: header
      ? { ...header, links: header.links.join("\n") }
      : { locale: "en", links: "" },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: profileHeaderSchema }),
  });

  return (
    <>
      <PageHeader title={t("profile.headerTitle")} description={t("profile.headerIntro")} />
      <Card>
        <CardContent className="pt-6">
          <Form method="post" className="grid gap-4" {...getFormProps(form)}>
            <TextField field={fields.name} label={t("profile.nameLabel")} autoComplete="name" />
            <TextField
              field={fields.headline}
              label={t("profile.headlineLabel")}
              description={t("profile.headlineHint")}
            />
            <TextField field={fields.location} label={t("profile.locationLabel")} />
            <TextAreaField
              field={fields.links}
              label={t("profile.linksLabel")}
              description={t("profile.linksHint")}
            />
            <TextAreaField field={fields.summary} label={t("profile.summaryLabel")} rows={5} />
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">{t("profile.localeLabel")}</legend>
              <div className="flex flex-wrap gap-2">
                {profileLocales.map((locale) => (
                  <label
                    key={locale}
                    className="flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm has-checked:border-primary"
                  >
                    <input
                      {...getInputProps(fields.locale, { type: "radio", value: locale })}
                      key={locale}
                      className="size-4 accent-primary"
                    />
                    {t(localeLabels[locale])}
                  </label>
                ))}
              </div>
              <FieldErrors id={fields.locale.errorId} errors={fields.locale.errors} />
            </fieldset>
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
    </>
  );
}
