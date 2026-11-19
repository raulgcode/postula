import { getFormProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { importProfileFormSchema, importProfileSchema } from "@postula/contracts";
import { InvalidProfileError, importarPerfil, runOperation, verPerfil } from "@postula/core";
import { UploadIcon } from "lucide-react";
import { data, Form, href, Link, redirect, useNavigation } from "react-router";
import { PageHeader } from "~/components/page-header";
import { TextAreaField } from "~/components/text-area-field";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { tenantContext } from "~/context";
import { metaT, useT } from "~/lib/i18n";
import { serverT, translations } from "~/lib/locale.server";
import { coreServices } from "~/lib/services.server";
import type { Route } from "./+types/profile.import";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: metaT(matches)("profile.importTitle") }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const { items } = await runOperation(
    verPerfil,
    { tenant: context.get(tenantContext), services: coreServices, via: "web" },
    {},
  );
  return { itemCount: items.length, i18n: translations(context, "profile", "forms") };
}

/** The same `importar_perfil` an AI calls: the pasted text has to be the profile's JSON. */
export async function action({ request, context }: Route.ActionArgs) {
  const submission = parseWithZod(await request.formData(), { schema: importProfileFormSchema });
  if (submission.status !== "success") {
    return data({ result: submission.reply() }, { status: 400 });
  }
  const invalid = (error = "forms.jsonInvalid") =>
    data({ result: submission.reply({ fieldErrors: { json: [error] } }) }, { status: 400 });
  let parsed: unknown;
  try {
    parsed = JSON.parse(submission.value.json);
  } catch {
    return invalid();
  }
  const profile = importProfileSchema.safeParse(parsed);
  if (!profile.success) return invalid();
  try {
    await runOperation(
      importarPerfil,
      { tenant: context.get(tenantContext), services: coreServices, via: "web" },
      profile.data,
    );
  } catch (error) {
    if (error instanceof InvalidProfileError) {
      // Which item to fix, in the person's language: a plain text that `FieldErrors` shows as is.
      return invalid(
        error.itemId ? serverT(context)("forms.jsonInvalidItem", { id: error.itemId }) : undefined,
      );
    }
    throw error;
  }
  throw redirect(href("/app/profile"));
}

export default function ImportProfile({ loaderData, actionData }: Route.ComponentProps) {
  const t = useT();
  const navigation = useNavigation();
  const saving = navigation.state === "submitting";
  const [form, fields] = useForm({
    id: "profile-import",
    lastResult: actionData?.result,
    shouldValidate: "onSubmit",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: importProfileFormSchema }),
  });

  return (
    <>
      <PageHeader title={t("profile.importTitle")} description={t("profile.importIntro")} />
      <Card>
        <CardContent className="pt-6">
          <Form method="post" className="grid gap-4" {...getFormProps(form)}>
            {loaderData.itemCount > 0 ? (
              <p role="status" className="text-sm font-medium">
                {t("profile.importReplaces", { count: loaderData.itemCount })}
              </p>
            ) : null}
            <TextAreaField
              field={fields.json}
              label={t("profile.importLabel")}
              rows={12}
              spellCheck={false}
              className="font-mono"
            />
            <p className="text-sm text-muted-foreground">{t("profile.importAiHint")}</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button asChild variant="outline">
                <Link to={href("/app/profile")}>{t("profile.cancel")}</Link>
              </Button>
              <Button type="submit" size="lg" disabled={saving}>
                <UploadIcon aria-hidden />
                {saving ? t("profile.saving") : t("profile.importSubmit")}
              </Button>
            </div>
          </Form>
        </CardContent>
      </Card>
    </>
  );
}
