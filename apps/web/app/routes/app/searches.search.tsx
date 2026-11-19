import { getFormProps, getInputProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import {
  addSearchCompanySchema,
  boardUrl,
  jobBoards,
  type SearchCompany,
  type SearchRun,
  updateSearchFormSchema,
} from "@postula/contracts";
import {
  agregarEmpresa,
  borrarBusqueda,
  correrBusqueda,
  DomainError,
  editarBusqueda,
  quitarEmpresa,
  runOperation,
  verBusqueda,
  verCorridas,
  verOfertas,
} from "@postula/core";
import { ExternalLinkIcon, ListIcon, PlusIcon, SearchIcon, Trash2Icon, XIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { data, Form, href, Link, redirect, useFetcher, useNavigation } from "react-router";
import { PageHeader } from "~/components/page-header";
import { SearchForm } from "~/components/search-form";
import { FieldErrors, TextField } from "~/components/text-field";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { tenantContext } from "~/context";
import { metaT, useLocale, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { searchFormDefaults } from "~/lib/searches";
import { coreServices } from "~/lib/services.server";
import type { Route } from "./+types/searches.search";

const ctxOf = (context: Route.LoaderArgs["context"]) => ({
  tenant: context.get(tenantContext),
  services: coreServices,
  via: "web" as const,
});

export async function loader({ params, context }: Route.LoaderArgs) {
  try {
    const ctx = ctxOf(context);
    const search = await runOperation(verBusqueda, ctx, { id: params.searchId });
    const [runs, open] = await Promise.all([
      runOperation(verCorridas, ctx, { id: search.id }),
      runOperation(verOfertas, ctx, { searchId: search.id, limit: 1 }),
    ]);
    return {
      search,
      lastRun: runs[0] ?? null,
      openPostings: open.total,
      i18n: translations(context, "searches", "forms"),
    };
  } catch (error) {
    if (error instanceof DomainError && error.code === "not_found") {
      throw data("Search not found", { status: 404 });
    }
    throw error;
  }
}

export function meta({ matches, loaderData }: Route.MetaArgs) {
  return [{ title: loaderData?.search.name ?? metaT(matches)("searches.editTitle") }];
}

/** One page, several small actions: the settings, a company in or out, and deleting it all. */
export async function action({ request, params, context }: Route.ActionArgs) {
  const ctx = ctxOf(context);
  const formData = await request.formData();
  const intent = formData.get("intent");
  if (intent === "delete") {
    await runOperation(borrarBusqueda, ctx, { id: params.searchId });
    throw redirect(href("/app/searches"));
  }
  if (intent === "run") {
    try {
      await runOperation(correrBusqueda, ctx, { id: params.searchId });
    } catch (error) {
      if (error instanceof DomainError && error.code === "search_running") {
        return { intent, result: undefined, busy: true };
      }
      throw error;
    }
    return { intent, result: undefined };
  }
  if (intent === "remove-company") {
    await runOperation(quitarEmpresa, ctx, {
      searchId: params.searchId,
      companyId: formData.get("companyId"),
    });
    return { intent, result: undefined };
  }
  if (intent === "add-company") {
    const submission = parseWithZod(formData, { schema: addSearchCompanySchema });
    if (submission.status !== "success") {
      return data({ intent, result: submission.reply() }, { status: 400 });
    }
    await runOperation(agregarEmpresa, ctx, submission.value);
    return { intent, result: submission.reply({ resetForm: true }) };
  }
  const submission = parseWithZod(formData, { schema: updateSearchFormSchema });
  if (submission.status !== "success") {
    return data({ intent: "settings", result: submission.reply() }, { status: 400 });
  }
  await runOperation(editarBusqueda, ctx, submission.value);
  return { intent: "settings", result: submission.reply() };
}

export default function SearchPage({ loaderData, actionData }: Route.ComponentProps) {
  const t = useT();
  const navigation = useNavigation();
  const { search, lastRun, openPostings } = loaderData;
  const settingsResult = actionData?.intent === "settings" ? actionData.result : undefined;
  const saved = settingsResult?.status === "success" && navigation.state === "idle";

  return (
    <>
      <PageHeader title={search.name} description={t("searches.intro")} />
      <div className="grid gap-6">
        <Postings
          searchId={search.id}
          runAt={search.runAt}
          lastRun={lastRun}
          openPostings={openPostings}
          busy={actionData?.intent === "run" && "busy" in actionData}
        />
        <SearchForm
          key={search.updatedAt}
          id={`search-${search.id}`}
          mode="update"
          defaultValue={{ ...searchFormDefaults(search), id: search.id }}
          lastResult={settingsResult}
          saving={
            navigation.state === "submitting" && navigation.formData?.get("intent") === "settings"
          }
          submitLabel={t("searches.save")}
          cancelTo={href("/app/searches")}
        >
          <input type="hidden" name="id" value={search.id} />
          {saved ? (
            <p role="status" className="text-sm font-medium">
              {t("searches.saved")}
            </p>
          ) : null}
        </SearchForm>

        <Companies searchId={search.id} companies={search.companies} />

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t("searches.deleteTitle")}</h2>
            </CardTitle>
            <CardDescription>{t("searches.deleteIntro")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Form method="post">
              <Button
                type="submit"
                name="intent"
                value="delete"
                variant="destructive"
                className="w-full sm:w-auto"
              >
                <Trash2Icon aria-hidden />
                {t("searches.deleteAction")}
              </Button>
            </Form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

const statusLabels = {
  unchecked: "searches.statusUnchecked",
  ok: "searches.statusOk",
  not_found: "searches.statusNotFound",
  error: "searches.statusError",
} as const;

function Postings({
  searchId,
  runAt,
  lastRun,
  openPostings,
  busy,
}: {
  searchId: string;
  runAt: string;
  lastRun: SearchRun | null;
  openPostings: number;
  busy: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const navigation = useNavigation();
  const running = navigation.state === "submitting" && navigation.formData?.get("intent") === "run";
  const failed = lastRun?.errors.map((error) => error.company) ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("searches.runTitle")}</h2>
        </CardTitle>
        <CardDescription>
          {lastRun
            ? t("searches.lastRun", {
                date: new Intl.DateTimeFormat(locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(lastRun.startedAt)),
              })
            : t("searches.neverRan", { time: runAt })}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div role="status" className="grid gap-1 text-sm">
          {running ? <p className="font-medium">{t("searches.runningNow")}</p> : null}
          {!running && busy ? <p className="font-medium">{t("searches.runBusy")}</p> : null}
          {!running && lastRun && lastRun.status !== "failed" ? (
            <p>
              {t("searches.runResult", {
                found: lastRun.found,
                added: lastRun.added,
                closed: lastRun.closed,
              })}
            </p>
          ) : null}
          {!running && lastRun?.status === "partial" ? (
            <p className="text-muted-foreground">
              {t("searches.runPartial", {
                companies: new Intl.ListFormat(locale).format(failed),
              })}
            </p>
          ) : null}
          {!running && lastRun?.status === "failed" ? <p>{t("searches.runFailed")}</p> : null}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Form method="post">
            <Button
              type="submit"
              name="intent"
              value="run"
              size="lg"
              className="w-full sm:w-auto"
              disabled={running}
            >
              <SearchIcon aria-hidden />
              {t("searches.runNow")}
            </Button>
          </Form>
          {openPostings > 0 ? (
            <Button asChild variant="outline" size="lg">
              <Link to={href("/app/searches/:searchId/postings", { searchId })}>
                <ListIcon aria-hidden />
                {t("searches.seePostings", { count: openPostings })}
              </Link>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function Companies({ searchId, companies }: { searchId: string; companies: SearchCompany[] }) {
  const t = useT();
  const fetcher = useFetcher<typeof action>();
  const adding = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "add-company";
  const tokenRef = useRef<HTMLInputElement>(null);
  const [form, fields] = useForm({
    id: `search-companies-${searchId}`,
    lastResult: fetcher.data?.intent === "add-company" ? fetcher.data.result : undefined,
    defaultValue: { searchId, board: "greenhouse" },
    shouldValidate: "onSubmit",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: addSearchCompanySchema }),
  });
  const addedAt = fetcher.data?.intent === "add-company" ? fetcher.data.result : undefined;
  // After adding one, the board name is ready for the next: a browser effect, not data.
  useEffect(() => {
    if (addedAt?.status === "success") tokenRef.current?.focus();
  }, [addedAt]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("searches.companiesTitle")}</h2>
        </CardTitle>
        <CardDescription>{t("searches.companiesIntro")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <fetcher.Form method="post" className="grid gap-4" {...getFormProps(form)}>
          <input type="hidden" name="searchId" value={searchId} />
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">{t("searches.boardLabel")}</legend>
            <div className="flex flex-wrap gap-2">
              {jobBoards.map((board) => {
                const props = getInputProps(fields.board, { type: "radio", value: board });
                return (
                  <label
                    key={board}
                    className="flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm capitalize has-checked:border-primary"
                  >
                    <input {...props} key={board} className="size-4 accent-primary" />
                    {board}
                  </label>
                );
              })}
            </div>
            <FieldErrors id={fields.board.errorId} errors={fields.board.errors} />
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              ref={tokenRef}
              field={fields.token}
              label={t("searches.tokenLabel")}
              description={t("searches.tokenHint")}
              autoCapitalize="none"
              spellCheck={false}
            />
            <TextField field={fields.company} label={t("searches.companyLabel")} />
          </div>
          <Button
            type="submit"
            name="intent"
            value="add-company"
            variant="outline"
            className="justify-self-start"
            disabled={adding}
          >
            <PlusIcon aria-hidden />
            {adding ? t("searches.adding") : t("searches.addCompany")}
          </Button>
        </fetcher.Form>

        {companies.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("searches.companiesEmpty")}</p>
        ) : (
          <ul className="grid gap-2" aria-label={t("searches.companiesTitle")}>
            {companies.map((company) => (
              <CompanyRow key={company.id} company={company} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function CompanyRow({ company }: { company: SearchCompany }) {
  const t = useT();
  const fetcher = useFetcher();
  if (fetcher.state !== "idle") return null;
  return (
    <li className="flex items-center justify-between gap-2 rounded-md border py-1 pr-1 pl-3">
      <div className="grid min-w-0 gap-0.5">
        <p className="font-medium break-words">{company.company}</p>
        <p className="text-sm text-muted-foreground">
          <span className="capitalize">{company.board}</span> · {company.token} ·{" "}
          {t(statusLabels[company.status])}
        </p>
      </div>
      <div className="flex shrink-0">
        <Button asChild variant="ghost" size="icon" className="size-11">
          <a
            href={boardUrl(company.board, company.token)}
            target="_blank"
            rel="noreferrer"
            aria-label={t("searches.openBoard", { company: company.company })}
          >
            <ExternalLinkIcon aria-hidden />
          </a>
        </Button>
        <fetcher.Form method="post">
          <input type="hidden" name="companyId" value={company.id} />
          <Button
            type="submit"
            name="intent"
            value="remove-company"
            variant="ghost"
            size="icon"
            className="size-11"
            aria-label={t("searches.removeCompany", { company: company.company })}
          >
            <XIcon aria-hidden />
          </Button>
        </fetcher.Form>
      </div>
    </li>
  );
}
