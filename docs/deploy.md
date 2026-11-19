# Production on Fly.io

Postula runs on Fly.io as two apps built from the same image (`Dockerfile`), plus the database:

| What          | Where                                                                              | Config         |
| ------------- | ---------------------------------------------------------------------------------- | -------------- |
| `postula-web` | `app.postula.intensoft.dev`: pages, sign-in, the panel                             | `fly.web.toml` |
| `postula-api` | `api.postula.intensoft.dev`: REST, MCP, webhooks (`app`) and the worker (`worker`) | `fly.api.toml` |
| Postgres      | `DATABASE_URL`, same region as the apps (`iad`)                                    | —              |

The API and the web stop when idle and wake on the next request. The worker runs only while
someone has **Búsqueda activa** on (see "The worker" below).

The public URLs (`APP_URL`, `API_URL`) and `CLIENT_IP_HEADER` are in `[env]` of each
`fly.*.toml`; everything else is a secret, the same in both apps.

## Once

### 1. Fly

```bash
brew install flyctl
fly auth login
fly apps create postula-api
fly apps create postula-web
```

If a name is taken, pick another and change it in `app = "…"` of the `fly.*.toml` and in
`APPS` of `tooling/fly-secrets/index.ts`.

### 2. Database

Postgres runs as one machine of its own on Fly (`postula-db`, unmanaged, about US$2–3 a month
with a 1 GB volume), in the same region as the apps:

```bash
fly postgres create --name postula-db --region iad --initial-cluster-size 1 \
  --vm-size shared-cpu-1x --volume-size 1 --image-ref flyio/postgres-flex:17
```

It prints the `postgres` user's password once: keep it in your password manager. Then create
the app's database and user:

```bash
fly postgres connect -a postula-db
# inside psql:
#   create user postula with password '<a new one: openssl rand -hex 24>';
#   create database postula owner postula;
#   \q
```

`DATABASE_URL` is
`postgres://postula:<that password>@postula-db.flycast:5432/postula` (the private network, a
direct connection: no transaction pooler, pg-boss needs session features). The API's
`release_command` runs the migrations on each deploy.

**Backups.** Fly takes a snapshot of the volume every day and keeps it 5 days
(`fly volumes list -a postula-db`, `fly volumes snapshots list <volume id>`). To restore one:
`fly postgres create --snapshot-id <id> …` with the same flags, and point `DATABASE_URL` at the
new app. For a copy on your own machine: `fly proxy 15432:5432 -a postula-db` and, in another
terminal, `pg_dump postgres://postula:<password>@localhost:15432/postula > postula.sql`.

### 3. Secrets

Build `.env.production` from your `.env` (`.gitignore` keeps it out of git) and change what is
for development:

| Variable               | In production                                                              |
| ---------------------- | -------------------------------------------------------------------------- |
| `DATABASE_URL`         | The direct URL from step 2                                                 |
| `BETTER_AUTH_SECRET`   | A new one: `openssl rand -base64 32`. Changing it later signs everyone out |
| `AUTH_METHODS`         | The same as in your `.env` (or whichever you want in production)           |
| `SMTP_*`, `EMAIL_FROM` | Your email provider (Resend, Postmark, SES…), with the domain verified     |
| `GOOGLE_*`             | Only with `google`: the same OAuth client as locally                       |

With Google, add the redirect URI `https://app.postula.intensoft.dev/api/auth/callback/google` to the
OAuth client.

Check and send:

```bash
pnpm fly:secrets --check   # says what is missing or still points at your machine
pnpm fly:secrets           # sends them to postula-api and postula-web
```

The script sends nothing while there is a problem (localhost, Mailpit, the development
`BETTER_AUTH_SECRET`) and leaves out what goes in `fly.*.toml` and what is local only
(`TEST_DATABASE_URL`, `MAILPIT_URL`). The secrets apply with the next deploy.

### 4. GitHub Actions

One deploy token per app, saved as a repository secret:

```bash
gh secret set FLY_API_TOKEN_API --body "$(fly tokens create deploy -a postula-api -x 8760h)"
gh secret set FLY_API_TOKEN_WEB --body "$(fly tokens create deploy -a postula-web -x 8760h)"
```

Without `gh`: GitHub → Settings → Secrets and variables → Actions → New repository secret, with
the full text `fly tokens create deploy …` prints (it starts with `FlyV1 `). They expire in a
year: run these two commands again before then.

### 5. First deploy

```bash
git checkout main && git pull
pnpm release 1.0.0
```

Follow it in Actions → Deploy. The first time, Fly creates the machines and gives them IPs.

### 6. Domains

```bash
fly certs add app.postula.intensoft.dev -a postula-web
fly certs add api.postula.intensoft.dev -a postula-api
```

In your DNS: a `CNAME` from `app` → `postula-web.fly.dev` and from `api` → `postula-api.fly.dev`.
If the DNS is on Cloudflare, leave them as **DNS only** (grey cloud): Fly issues the certificate
and `Fly-Client-IP` stays the client's real IP for the rate limits.
`fly certs check <domain> -a <app>` says when it's ready.

### 7. Check

- `curl https://api.postula.intensoft.dev/health` → `{"status":"ok","database":"ok"}`
- `https://app.postula.intensoft.dev/login` shows the methods in `AUTH_METHODS` and the email arrives.

## Every release

```bash
pnpm release          # 1.4.2 → 1.4.3
pnpm release minor    # 1.4.2 → 1.5.0
pnpm release major    # 1.4.2 → 2.0.0
pnpm release 2.1.0    # an exact one, higher than the last
```

It requires being on `main`, with no changes and up to date with GitHub; it asks before
publishing (`--yes` skips that) and, with `gh`, follows the deploy to the end. Without a
terminal: Actions → Deploy → Run workflow, with the version (`patch` by default).

What `.github/workflows/deploy.yml` does with the `vX.Y.Z` tag:
1. Waits for that commit's CI (lint, typecheck and Vitest) and stops if it fails.
2. Deploys `postula-api`. Before starting it, `release_command` runs the migrations; if they
   fail, nothing is deployed and the previous version keeps running.
3. Deploys `postula-web`.

## Operate

```bash
fly logs -a postula-api                     # or postula-web
fly status -a postula-web
fly ssh console -a postula-api              # a shell on the machine (cd /app)
fly secrets list -a postula-api
fly secrets deploy -a postula-api           # applies secrets without waiting for a release
```

- **Roll back**: `fly deploy --config fly.web.toml --image
  registry.fly.io/postula-web:v1.4.2` (same for the API). Migrations aren't undone: each
  migration must be compatible with the previous version.
- **More machines**: the web scales with `fly scale count 2 -a postula-web`. Keep one `worker`
  machine: the switch starts and stops the ones it finds, and pg-boss shares the queue anyway.

## The worker and "Búsqueda activa"

The `worker` process group of `postula-api` runs the queue (pg-boss, schema `pgboss` of the same
Postgres): searches, matching, documents, sending and the crons. It costs only while it runs:

- The panel's switch (and the AI's `encender_busqueda`) starts its machine through the Machines
  API with `FLY_API_TOKEN`; `apagar_busqueda` stops it when nobody else has it on.
- The worker checks every minute whether anyone still has the search on; when nobody does it
  exits with 0, and `[[restart]] policy = "on-failure"` leaves it stopped. A deploy starts it and
  it stops again the same way.
- Jobs sent while it's off wait in the queue; a cron that came due while it was off runs once
  when it starts (`missed: "once"`).

The token, once (as a secret of both apps, so the web and the API can flip the switch):

```bash
fly tokens create deploy -a postula-api -x 8760h   # copy the whole "FlyV1 …" line
```

and put it in `.env.production` as `FLY_API_TOKEN=FlyV1 …` before `pnpm fly:secrets`. The first
deploy creates one `app` and one `worker` machine; if Fly made two of a group, `fly scale count
app=1 worker=1 -a postula-api`.
