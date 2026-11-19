import { href, type MiddlewareFunction, redirect } from "react-router";
import { sessionContext, tenantContext } from "~/context";
import { applyAccountLocale } from "~/lib/locale.server";
import { auth, db } from "~/lib/services.server";

export const requireSession: MiddlewareFunction<Response> = async ({ request, url, context }) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    // `url`, not `request.url`: a client navigation asks for `/app.data`, and the link must not.
    throw redirect(`${href("/login")}?redirectTo=${encodeURIComponent(url.pathname)}`);
  }
  context.set(sessionContext, session);
  await applyAccountLocale(request, context, session.user);
};

/**
 * The tenant is the signed-in person: Postula has no shared workspaces, so it comes from the
 * session and never from the URL, a form field or a tool argument.
 */
export const requireTenant: MiddlewareFunction<Response> = async ({ context }) => {
  const { user } = context.get(sessionContext);
  context.set(tenantContext, { db, userId: user.id });
};
