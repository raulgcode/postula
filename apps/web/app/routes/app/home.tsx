import { PageHeader } from "~/components/page-header";
import { sessionContext } from "~/context";
import { metaT, useT } from "~/lib/i18n";
import type { Route } from "./+types/home";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: metaT(matches)("app.homeTitle") }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const { user } = context.get(sessionContext);
  return { name: user.name || user.email };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const t = useT();
  return (
    <PageHeader
      title={t("app.homeHeading", { name: loaderData.name })}
      description={t("app.homeIntro")}
    />
  );
}
