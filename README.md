# Postula

## Run it on your machine

You need Node 22.22+, Docker running and Git. The first time:

```bash
git clone https://github.com/raulgcode/postula.git && cd postula
corepack enable && pnpm install
pnpm run setup     # .env, secrets, sign-in methods, Docker (Postgres + Mailpit), migrations, hooks, Chromium
pnpm dev           # web http://localhost:5173 · api http://localhost:3001
```

Every time you pull `main` again:

```bash
git pull
pnpm install       # new or updated dependencies
pnpm db:up         # Postgres and Mailpit, if Docker was stopped
pnpm db:migrate    # new migrations
pnpm dev
```

- Sign in as any user at http://localhost:5173/dev/sign-in (only in `pnpm dev`).
- Emails (sign-in links, confirmations) land in Mailpit: http://localhost:8025.
- Change how people sign in: `pnpm run setup --auth magic-link,password,google`.
- Tests: `pnpm test` (unit, integration, browser) and `pnpm test:e2e` (Playwright, phone and
  desktop). `pnpm lint` and `pnpm typecheck` check the code.
- Start the database from scratch (deletes the local data): `docker compose down -v`, then
  `pnpm db:up && pnpm db:migrate`.

## How we work here

Everything is in [AGENTS.md](AGENTS.md): the monorepo map, the rules (CLI first, React Router
with its skill, forms with Conform + Zod, mobile first, tests, languages, security) and the
commands. For a new feature, the [new-feature](.agents/skills/new-feature/SKILL.md) skill.
Production: [docs/deploy.md](docs/deploy.md).
