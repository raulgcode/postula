import { parseWithZod } from "@conform-to/zod/v4";
import { moveProfileItemSchema, type ProfileItem } from "@postula/contracts";
import { moverItemPerfil, runOperation, verPerfil } from "@postula/core";
import { ArrowDownIcon, ArrowUpIcon, PencilIcon, PlusIcon, UploadIcon } from "lucide-react";
import { data, href, Link, useFetcher } from "react-router";
import { PageHeader } from "~/components/page-header";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { tenantContext } from "~/context";
import { metaT, useLocale, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { itemDetail, itemName, profileSections } from "~/lib/profile";
import { coreServices } from "~/lib/services.server";
import type { Route } from "./+types/profile";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: metaT(matches)("profile.title") }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const profile = await runOperation(
    verPerfil,
    { tenant: context.get(tenantContext), services: coreServices, via: "web" },
    {},
  );
  return { profile, i18n: translations(context, "profile") };
}

/** Moving an item up or down: the person stays on the page, so it comes from a fetcher. */
export async function action({ request, context }: Route.ActionArgs) {
  const submission = parseWithZod(await request.formData(), { schema: moveProfileItemSchema });
  if (submission.status !== "success") throw data("Invalid move", { status: 400 });
  await runOperation(
    moverItemPerfil,
    { tenant: context.get(tenantContext), services: coreServices, via: "web" },
    submission.value,
  );
  return { ok: true };
}

const sectionTitles = {
  experience: "profile.sectionExperience",
  project: "profile.sectionProject",
  skill_group: "profile.sectionSkillGroup",
  education: "profile.sectionEducation",
  certification: "profile.sectionCertification",
  language: "profile.sectionLanguage",
} as const;

const addLabels = {
  experience: "profile.addExperience",
  project: "profile.addProject",
  skill_group: "profile.addSkillGroup",
  education: "profile.addEducation",
  certification: "profile.addCertification",
  language: "profile.addLanguage",
} as const;

function newItemHref(kind: ProfileItem["kind"], parentId?: string) {
  const search = new URLSearchParams({ kind });
  if (parentId) search.set("parent", parentId);
  return `${href("/app/profile/items/:itemId", { itemId: "new" })}?${search}`;
}

export default function Profile({ loaderData }: Route.ComponentProps) {
  const t = useT();
  const locale = useLocale();
  const { header, items, version } = loaderData.profile;
  const empty = !header && items.length === 0;
  const childrenOf = (id: string) => items.filter((item) => item.parentId === id);

  return (
    <>
      <PageHeader title={t("profile.title")} description={t("profile.intro")}>
        <Button asChild variant="outline">
          <Link to={href("/app/profile/import")}>
            <UploadIcon aria-hidden />
            {t("profile.importAction")}
          </Link>
        </Button>
      </PageHeader>
      <div className="grid gap-6">
        {empty ? (
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{t("profile.emptyTitle")}</h2>
              </CardTitle>
              <CardDescription>{t("profile.emptyIntro")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link to={href("/app/profile/import")}>
                  <UploadIcon aria-hidden />
                  {t("profile.importAction")}
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="grid min-w-0 gap-1.5">
              <CardTitle>
                <h2>{header?.name ?? t("profile.headerTitle")}</h2>
              </CardTitle>
              <CardDescription>
                {header ? header.headline : t("profile.headerMissing")}
              </CardDescription>
            </div>
            <Button asChild variant="outline" className="shrink-0">
              <Link to={href("/app/profile/edit")}>
                <PencilIcon aria-hidden />
                {header ? t("profile.editHeader") : t("profile.addHeader")}
              </Link>
            </Button>
          </CardHeader>
          {header ? (
            <CardContent className="grid gap-2 text-sm">
              {header.location ? <p className="text-muted-foreground">{header.location}</p> : null}
              {header.links.length ? (
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  {header.links.map((link) => (
                    <li key={link} className="break-all">
                      {link}
                    </li>
                  ))}
                </ul>
              ) : null}
              {header.summary ? <p className="whitespace-pre-line">{header.summary}</p> : null}
              {version ? (
                <p className="text-xs text-muted-foreground">
                  {t("profile.versionSaved", {
                    date: new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(version.createdAt)),
                  })}
                </p>
              ) : null}
            </CardContent>
          ) : null}
        </Card>

        {profileSections.map((kind) => {
          const sectionItems = items.filter((item) => item.kind === kind);
          return (
            <section key={kind} aria-labelledby={`section-${kind}`} className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id={`section-${kind}`} className="text-lg font-semibold">
                  {t(sectionTitles[kind])}
                </h2>
                <Button asChild variant="ghost">
                  <Link to={newItemHref(kind)}>
                    <PlusIcon aria-hidden />
                    {t(addLabels[kind])}
                  </Link>
                </Button>
              </div>
              {sectionItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("profile.sectionEmpty")}</p>
              ) : (
                <ul className="grid gap-3">
                  {sectionItems.map((item, index) => (
                    <li key={item.id}>
                      <ItemCard
                        item={item}
                        first={index === 0}
                        last={index === sectionItems.length - 1}
                        achievements={childrenOf(item.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

function ItemCard({
  item,
  first,
  last,
  achievements,
}: {
  item: ProfileItem;
  first: boolean;
  last: boolean;
  achievements: ProfileItem[];
}) {
  const t = useT();
  const name = itemName(item);
  const detail = itemDetail(item, t);
  const holdsAchievements = item.kind === "experience" || item.kind === "project";
  return (
    <Card className="gap-3 py-4">
      <CardContent className="grid gap-3 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="grid min-w-0 gap-1">
            <h3 className="font-medium break-words">{name}</h3>
            {detail ? <p className="text-sm text-muted-foreground">{detail}</p> : null}
          </div>
          <ItemActions item={item} name={name} first={first} last={last} />
        </div>
        {holdsAchievements ? (
          <div className="grid gap-2">
            {achievements.length ? (
              <ul aria-label={t("profile.achievementsOf", { name })} className="grid gap-2">
                {achievements.map((achievement, index) => (
                  <li
                    key={achievement.id}
                    className="flex items-start justify-between gap-2 border-l-2 pl-3 text-sm"
                  >
                    <p className="min-w-0 py-1 break-words">{itemName(achievement)}</p>
                    <ItemActions
                      item={achievement}
                      name={itemName(achievement).slice(0, 40)}
                      first={index === 0}
                      last={index === achievements.length - 1}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
            <Button asChild variant="ghost" className="justify-self-start">
              <Link to={newItemHref("achievement", item.id)}>
                <PlusIcon aria-hidden />
                {t("profile.addAchievement")}
              </Link>
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Up, down and edit: each 44 px, and each says which item it acts on. */
function ItemActions({
  item,
  name,
  first,
  last,
}: {
  item: ProfileItem;
  name: string;
  first: boolean;
  last: boolean;
}) {
  const t = useT();
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  return (
    <div className="flex shrink-0 items-center">
      <fetcher.Form method="post" className="flex">
        <input type="hidden" name="id" value={item.id} />
        <Button
          type="submit"
          name="direction"
          value="up"
          variant="ghost"
          size="icon"
          className="size-11"
          disabled={first || busy}
          aria-label={t("profile.moveUp", { name })}
        >
          <ArrowUpIcon aria-hidden />
        </Button>
        <Button
          type="submit"
          name="direction"
          value="down"
          variant="ghost"
          size="icon"
          className="size-11"
          disabled={last || busy}
          aria-label={t("profile.moveDown", { name })}
        >
          <ArrowDownIcon aria-hidden />
        </Button>
      </fetcher.Form>
      <Button asChild variant="ghost" size="icon" className="size-11">
        <Link
          to={href("/app/profile/items/:itemId", { itemId: item.id })}
          aria-label={t("profile.editNamed", { name })}
        >
          <PencilIcon aria-hidden />
        </Link>
      </Button>
    </div>
  );
}
