# Deployment

Vercel for the app, Turso for the database. Both on free tiers.

Live at **https://crossval-mini-apps.vercel.app**

## Where the credentials live

The deployed database credentials go in `.env.turso`, which is gitignored.

That filename is deliberate. `.env.production.local` is a name Next.js knows about: `next start` loads it automatically, and it wins over `.env.local`. Keep production credentials under that name and a local production build quietly reads and writes the live database. That happened here once and put stray test data into Turso before I noticed. A filename Next.js doesn't recognise is only ever used when you source it on purpose.

## Setting it up the first time

```bash
turso auth login
turso db create crossval-mini-apps
turso db show crossval-mini-apps --url          # -> TURSO_DATABASE_URL
turso db tokens create crossval-mini-apps       # -> TURSO_AUTH_TOKEN

vercel login
vercel link
vercel env add TURSO_DATABASE_URL production
vercel env add TURSO_AUTH_TOKEN production
vercel env add BETTER_AUTH_SECRET production    # openssl rand -base64 32
vercel env add BETTER_AUTH_URL production       # https://<deployment>.vercel.app

# Create the schema and load the sample data on the deployed database.
# --yes is required for a remote target, because seeding replaces the demo data.
set -a; . ./.env.turso; set +a
yarn bootstrap --yes

vercel deploy --prod
```

## After that

```bash
vercel deploy --prod
```

The schema only needs pushing again when it has actually changed:

```bash
set -a; . ./.env.turso; set +a
yarn db:push
```

## Two things that will catch you out

**Use the `libsql://` URL, not the `https://` one.** The `libsql://` scheme connects over a websocket, which supports the interactive transactions the app relies on for its payment balance checks and audit writes. The HTTP-only endpoint doesn't, and it fails at runtime rather than at deploy time, so you find out late.

**`BETTER_AUTH_URL` has to match the deployed address.** If it doesn't, signing in and signing up return `INVALID_ORIGIN` and the app rejects its own front end. Leaving it unset is safe now, because the app works the address out from Vercel's own host variables, which also means preview deployments authenticate with no extra setup. Setting it to the wrong value is not safe, so it's worth checking after a domain change.

## Why it runs the same in both places

Vercel Functions run on Node.js, so the libSQL client is the same one used locally. One line decides which database is used:

```ts
const url = process.env.TURSO_DATABASE_URL ?? "file:./local.db";
```

Nothing else changes behaviour based on environment. Locally it talks to a file, in production it talks to Turso, and everything in between is identical. That's what stops the deployed app behaving differently from the one you tested.
