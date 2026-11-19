import { parseWithZod } from "@conform-to/zod/v4";
import { defaultSearchSettings, searchFormSchema, searchSettingsSchema } from "@postula/contracts";
import { crearBusqueda, runOperation } from "@postula/core";
import { data, href, redirect, useNavigation } from "react-router";
import { PageHeader } from "~/components/page-header";
import { SearchForm } from "~/components/search-form";
import { tenantContext } from "~/context";
import { metaT, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { searchFormDefaults } from "~/lib/searches";
import { coreServices } from "~/lib/services.server";
import type { Route } from "./+types/searches.new";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: metaT(matches)("searches.newTitle") }];
}

export async function loader({ context }: Route.LoaderArgs) {
  return {
    defaults: searchFormDefaults(searchSettingsSchema.parse(defaultSearchSettings)),
    i18n: translations(context, "searches", "forms"),
  };
}

/** Starts with Postula's suggested companies, like an AI calling `crear_busqueda` without them. */
export async function action({ request, context }: Route.ActionArgs) {
  const submission = parseWithZod(await request.formData(), { schema: searchFormSchema });
  if (submission.status !== "success") {
    return data({ result: submission.reply() }, { status: 400 });
  }
  const search = await runOperation(
    crearBusqueda,
    { tenant: context.get(tenantContext), services: coreServices, via: "web" },
    submission.value,
  );
  throw redirect(href("/app/searches/:searchId", { searchId: search.id }));
}

export default function NewSearch({ loaderData, actionData }: Route.ComponentProps) {
  const t = useT();
  const navigation = useNavigation();
  return (
    <>
      <PageHeader title={t("searches.newTitle")} description={t("searches.newIntro")} />
      <SearchForm
        id="search-new"
        mode="create"
        defaultValue={loaderData.defaults}
        lastResult={actionData?.result}
        saving={navigation.state === "submitting"}
        submitLabel={t("searches.create")}
        cancelTo={href("/app/searches")}
      />
    </>
  );
}
