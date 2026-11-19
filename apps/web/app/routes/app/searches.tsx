import { listarBusquedas, runOperation } from "@postula/core";
import { ChevronRightIcon, PlusIcon } from "lucide-react";
import { href, Link } from "react-router";
import { PageHeader } from "~/components/page-header";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { tenantContext } from "~/context";
import { metaT, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { coreServices } from "~/lib/services.server";
import type { Route } from "./+types/searches";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: metaT(matches)("searches.title") }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const searches = await runOperation(
    listarBusquedas,
    { tenant: context.get(tenantContext), services: coreServices, via: "web" },
    {},
  );
  return { searches, i18n: translations(context, "searches") };
}

export default function Searches({ loaderData }: Route.ComponentProps) {
  const t = useT();
  const { searches } = loaderData;
  const newSearch = (
    <Button asChild size="lg" className="w-full sm:w-auto">
      <Link to={href("/app/searches/new")}>
        <PlusIcon aria-hidden />
        {t("searches.newAction")}
      </Link>
    </Button>
  );

  return (
    <>
      <PageHeader title={t("searches.title")} description={t("searches.intro")}>
        {searches.length ? newSearch : null}
      </PageHeader>
      {searches.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t("searches.emptyTitle")}</h2>
            </CardTitle>
            <CardDescription>{t("searches.emptyIntro")}</CardDescription>
          </CardHeader>
          <CardContent>{newSearch}</CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3">
          {searches.map((search) => (
            <li key={search.id}>
              <Link
                to={href("/app/searches/:searchId", { searchId: search.id })}
                aria-label={t("searches.open", { name: search.name })}
                className="flex min-h-11 items-center justify-between gap-3 rounded-xl border bg-card p-4 text-card-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
              >
                <div className="grid min-w-0 gap-1">
                  <h2 className="font-medium break-words">{search.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {search.enabled
                      ? t("searches.runsAt", { time: search.runAt, zone: search.timeZone })
                      : t("searches.paused")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("searches.companyCount", { count: search.companyCount })} ·{" "}
                    {search.mode === "semi"
                      ? t("searches.modeSemiShort")
                      : t("searches.modeManualShort")}
                  </p>
                </div>
                <ChevronRightIcon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
