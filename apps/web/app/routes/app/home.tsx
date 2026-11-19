import { parseWithZod } from "@conform-to/zod/v4";
import { type SearchStatus, setSearchSchema, type WorkerState } from "@postula/contracts";
import { DomainError, estadoBusqueda, runOperation, searchSwitchOperation } from "@postula/core";
import { PowerIcon, PowerOffIcon } from "lucide-react";
import { data, useFetcher } from "react-router";
import { PageHeader } from "~/components/page-header";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { sessionContext, tenantContext } from "~/context";
import { metaT, useT } from "~/lib/i18n";
import { coreServices } from "~/lib/services.server";
import type { Route } from "./+types/home";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: metaT(matches)("app.homeTitle") }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const { user } = context.get(sessionContext);
  const search = await runOperation(
    estadoBusqueda,
    { tenant: context.get(tenantContext), services: coreServices, via: "web" },
    {},
  );
  return { name: user.name || user.email, search };
}

/** "Búsqueda activa": the same operations the AI calls through MCP, audited as "web". */
export async function action({ request, context }: Route.ActionArgs) {
  const submission = parseWithZod(await request.formData(), { schema: setSearchSchema });
  if (submission.status !== "success") throw data("Invalid switch", { status: 400 });
  try {
    await runOperation(
      searchSwitchOperation(submission.value),
      { tenant: context.get(tenantContext), services: coreServices, via: "web" },
      {},
    );
    return { error: null };
  } catch (error) {
    if (error instanceof DomainError && error.code === "worker_unreachable") {
      return data({ error: "workerUnreachable" as const }, { status: 503 });
    }
    throw error;
  }
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const t = useT();
  return (
    <>
      <PageHeader
        title={t("app.homeHeading", { name: loaderData.name })}
        description={t("app.homeIntro")}
      />
      <SearchSwitch search={loaderData.search} />
    </>
  );
}

const workerTexts = {
  running: "app.workerRunning",
  starting: "app.workerStarting",
  stopped: "app.workerStopped",
  unknown: "app.workerUnknown",
} as const satisfies Record<WorkerState, string>;

/**
 * The switch that starts and stops the worker. The person stays on the page, so it's a fetcher;
 * while it saves, the card already shows the new state.
 */
function SearchSwitch({ search }: { search: SearchStatus }) {
  const t = useT();
  const fetcher = useFetcher<typeof action>();
  const saving = fetcher.state !== "idle";
  const active = fetcher.formData ? fetcher.formData.has("active") : search.active;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("app.searchTitle")}</h2>
        </CardTitle>
        <CardDescription>{t(active ? "app.searchOn" : "app.searchOff")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p role="status" className="text-sm text-muted-foreground">
          {t(workerTexts[search.worker.state])}
        </p>
        {fetcher.data?.error ? (
          <p role="alert" className="text-sm text-destructive">
            {t(`app.${fetcher.data.error}`)}
          </p>
        ) : null}
        <fetcher.Form method="post" className="grid gap-2">
          {active ? null : <input type="hidden" name="active" value="on" />}
          <Button
            type="submit"
            size="lg"
            variant={active ? "outline" : "default"}
            disabled={saving}
            className="w-full sm:w-auto"
          >
            {active ? <PowerOffIcon aria-hidden /> : <PowerIcon aria-hidden />}
            {saving ? t("app.searchSaving") : t(active ? "app.searchTurnOff" : "app.searchTurnOn")}
          </Button>
          <p className="text-sm text-muted-foreground">{t("app.searchCost")}</p>
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}
