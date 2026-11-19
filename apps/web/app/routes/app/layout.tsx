import { Outlet } from "react-router";
import { AppShell } from "~/components/app-shell";
import { translations } from "~/lib/locale.server";
import { requireSession, requireTenant } from "~/middleware/auth.server";
import type { Route } from "./+types/layout";

// Every route under /app has a signed-in person in `sessionContext` and their tenant in
// `tenantContext`.
export const middleware: Route.MiddlewareFunction[] = [requireSession, requireTenant];

export async function loader({ context }: Route.LoaderArgs) {
  return { i18n: translations(context, "app") };
}

export default function AppLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
