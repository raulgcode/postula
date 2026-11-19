import type { JobPostingSummary } from "@postula/contracts";
import { DomainError, runOperation, verBusqueda, verOfertas } from "@postula/core";
import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react";
import { data, href, Link } from "react-router";
import { PageHeader } from "~/components/page-header";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { tenantContext } from "~/context";
import { metaT, useLocale, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { coreServices } from "~/lib/services.server";
import type { Route } from "./+types/searches.postings";

const PAGE_SIZE = 50;

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const ctx = { tenant: context.get(tenantContext), services: coreServices, via: "web" as const };
  const page = Math.max(1, Number(new URL(request.url).searchParams.get("page")) || 1);
  try {
    const search = await runOperation(verBusqueda, ctx, { id: params.searchId });
    const { total, postings } = await runOperation(verOfertas, ctx, {
      searchId: search.id,
      limit: PAGE_SIZE * page,
    });
    return {
      search: { id: search.id, name: search.name },
      total,
      postings,
      page,
      i18n: translations(context, "searches"),
    };
  } catch (error) {
    if (error instanceof DomainError && error.code === "not_found") {
      throw data("Search not found", { status: 404 });
    }
    throw error;
  }
}

export function meta({ matches, loaderData }: Route.MetaArgs) {
  return [
    {
      title: metaT(matches)("searches.postingsTitle", { name: loaderData?.search.name ?? "" }),
    },
  ];
}

export default function Postings({ loaderData }: Route.ComponentProps) {
  const t = useT();
  const { search, total, postings, page } = loaderData;
  const searchHref = href("/app/searches/:searchId", { searchId: search.id });
  return (
    <>
      <PageHeader
        title={t("searches.postingsTitle", { name: search.name })}
        description={t("searches.postingsIntro")}
      >
        <Button asChild variant="outline">
          <Link to={searchHref}>
            <ArrowLeftIcon aria-hidden />
            {t("searches.backToSearch")}
          </Link>
        </Button>
      </PageHeader>
      {postings.length === 0 ? (
        <p className="text-muted-foreground">{t("searches.postingsEmpty")}</p>
      ) : (
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            {t("searches.postingsCount", { count: total })}
          </p>
          <ul className="grid gap-3" aria-label={t("searches.runTitle")}>
            {postings.map((posting) => (
              <li key={posting.id}>
                <PostingCard posting={posting} />
              </li>
            ))}
          </ul>
          {postings.length < total ? (
            <Button asChild variant="outline" className="justify-self-center">
              <Link
                to={`${href("/app/searches/:searchId/postings", { searchId: search.id })}?page=${page + 1}`}
                preventScrollReset
              >
                {t("searches.morePostings")}
              </Link>
            </Button>
          ) : null}
        </div>
      )}
    </>
  );
}

const workplaceLabels = {
  remote: "searches.workplaceRemote",
  hybrid: "searches.workplaceHybrid",
  onsite: "searches.workplaceOnsite",
} as const;

const intervalLabels = {
  year: "searches.intervalYear",
  month: "searches.intervalMonth",
  hour: "searches.intervalHour",
} as const;

function PostingCard({ posting }: { posting: JobPostingSummary }) {
  const t = useT();
  const locale = useLocale();
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const { salary } = posting;
  const range = salary
    ? [salary.min, salary.max]
        .filter((value): value is number => value !== null)
        .map((value) => number.format(value))
        .join("–")
    : "";
  const details = [
    posting.location,
    posting.workplace === "unknown" ? null : t(workplaceLabels[posting.workplace]),
    range
      ? t("searches.salaryRange", {
          range,
          currency: salary?.currency ?? "",
          interval: salary?.interval ? t(intervalLabels[salary.interval]) : "",
        }).trim()
      : null,
  ].filter(Boolean);
  return (
    <Card className="gap-2 py-4">
      <CardContent className="flex items-start justify-between gap-2 px-4">
        <div className="grid min-w-0 gap-1">
          <h2 className="font-medium break-words">{posting.title}</h2>
          <p className="text-sm">{posting.company}</p>
          <p className="text-sm text-muted-foreground">{details.join(" · ")}</p>
          {posting.publishedAt ? (
            <p className="text-xs text-muted-foreground">
              {t("searches.published", {
                date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
                  new Date(posting.publishedAt),
                ),
              })}
            </p>
          ) : null}
        </div>
        <Button asChild variant="ghost" size="icon" className="size-11 shrink-0">
          <a
            href={posting.url}
            target="_blank"
            rel="noreferrer"
            aria-label={t("searches.openPosting", {
              title: posting.title,
              company: posting.company,
            })}
          >
            <ExternalLinkIcon aria-hidden />
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
