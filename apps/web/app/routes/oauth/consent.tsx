import { getFormProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { aiConsentSchema } from "@postula/contracts";
import { CheckIcon, ShieldCheckIcon } from "lucide-react";
import { useEffect } from "react";
import { data, Form, href, redirect, useNavigation } from "react-router";
import { StandalonePage } from "~/components/standalone-page";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { metaT, richText, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { isSignedConsentQuery } from "~/lib/oauth.server";
import { auth } from "~/lib/services.server";
import type { Route } from "./+types/consent";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: metaT(matches)("ai.title") }];
}

/**
 * An AI (Claude, ChatGPT…) asks to connect to the person's Postula. Better Auth sends them here
 * with the signed request once they're signed in; they allow it or not.
 */
export async function loader({ request, url, context }: Route.LoaderArgs) {
  const session = await auth.api.getSession({ headers: request.headers });
  // /login resumes the request once they sign in.
  if (!session) throw redirect(`${href("/login")}${url.search}`);
  const i18n = translations(context, "ai", "forms");
  const clientId = url.searchParams.get("client_id");
  if (!clientId || !(await isSignedConsentQuery(url))) return { expired: true as const, i18n };
  const client = await auth.api.getOAuthClientPublic({
    query: { client_id: clientId },
    headers: request.headers,
  });
  return {
    expired: false as const,
    client: { name: client.client_name ?? null, uri: client.client_uri ?? null },
    // An AI that only asked to read isn't told it can change anything.
    writes: (url.searchParams.get("scope") ?? "").split(" ").includes("write"),
    email: session.user.email,
    i18n,
  };
}

// `url`, not `request.url`: on a client navigation React Router adds `_routes` to the query,
// which would break the signature.
export async function action({ request, url }: Route.ActionArgs) {
  if (!(await isSignedConsentQuery(url))) throw data("Expired consent request", { status: 400 });
  const submission = parseWithZod(await request.formData(), { schema: aiConsentSchema });
  if (submission.status !== "success") {
    return data({ result: submission.reply(), redirectTo: null }, { status: 400 });
  }
  const { url: redirectTo } = await auth.api.oauth2Consent({
    body: { accept: submission.value.intent === "allow", oauth_query: url.searchParams.toString() },
    headers: request.headers,
    // Accepting runs the authorize step, which reads the request (only its headers).
    request,
    asResponse: false,
  });
  // The AI's own address (claude.ai, chatgpt.com, an editor on 127.0.0.1), which Better Auth
  // checked against the ones it registered. Not a redirect of this POST: the policy's
  // `form-action` would stop it, so the browser goes there from the page.
  return { result: null, redirectTo };
}

export default function Consent({ loaderData, actionData }: Route.ComponentProps) {
  const t = useT();
  const navigation = useNavigation();
  const redirectTo = actionData?.redirectTo;
  const [form] = useForm({
    lastResult: actionData?.result ?? undefined,
    shouldValidate: "onSubmit",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: aiConsentSchema }),
  });

  // A browser effect, not data: leave for the AI's address once the answer is saved.
  useEffect(() => {
    if (redirectTo) window.location.replace(redirectTo);
  }, [redirectTo]);

  if (loaderData.expired) {
    return (
      <StandalonePage>
        <h1 className="sr-only">{t("ai.title")}</h1>
        <p role="alert" className="rounded-lg border bg-muted p-4">
          {t("ai.consentExpired")}
        </p>
      </StandalonePage>
    );
  }

  const { client, writes, email } = loaderData;
  const clientName = client.name ?? t("ai.unknownClient");
  const busy = navigation.state !== "idle" || Boolean(redirectTo);
  const abilities = writes
    ? (["ai.consentRead", "ai.consentWrite"] as const)
    : (["ai.consentRead"] as const);

  return (
    <StandalonePage>
      <Card>
        <CardHeader>
          <span
            aria-hidden
            className="mb-2 grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground"
          >
            <ShieldCheckIcon className="size-6" />
          </span>
          <CardTitle>
            <h1 className="text-xl">{t("ai.consentTitle", { client: clientName })}</h1>
          </CardTitle>
          {client.uri ? (
            <CardDescription className="break-all">{client.uri}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-2">
            <p>
              {richText(
                t,
                "ai.consentIntro",
                { email: (text) => <strong>{text}</strong> },
                { email, client: clientName },
              )}
            </p>
            <ul className="grid gap-2">
              {abilities.map((key) => (
                <li key={key} className="flex gap-2">
                  <CheckIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
                  <span>{t(key)}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">{t("ai.consentNever")}</p>
          </div>
          {redirectTo ? (
            // Only if the browser didn't move on by itself.
            <a className="text-link underline underline-offset-4" href={redirectTo}>
              {clientName}
            </a>
          ) : null}
          {/* The answer at the bottom, under the thumb: allow first, then the way out. */}
          <Form method="post" {...getFormProps(form)}>
            <div className="grid gap-2 sm:flex sm:flex-row-reverse sm:justify-start">
              <Button type="submit" name="intent" value="allow" size="lg" disabled={busy}>
                {busy ? t("ai.connecting") : t("ai.allow")}
              </Button>
              <Button
                type="submit"
                name="intent"
                value="deny"
                size="lg"
                variant="outline"
                disabled={busy}
              >
                {t("ai.deny")}
              </Button>
            </div>
          </Form>
        </CardContent>
      </Card>
    </StandalonePage>
  );
}
