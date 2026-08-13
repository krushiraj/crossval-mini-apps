// One-command setup: apply the schema, then load the sample data.
//
//   yarn bootstrap
//
// With no configuration this targets the local SQLite file (./local.db), so
// a fresh clone runs without any cloud credentials.
//
// If TURSO_DATABASE_URL points at a remote database, the script refuses to
// run unless --yes is passed. Seeding deletes and recreates the demo
// account's data — fine locally, not something that should happen to a
// deployed database because someone had that env var set in their shell.

import { spawnSync } from "node:child_process";

const LOCAL_URL = "file:./local.db";

const databaseUrl = process.env.TURSO_DATABASE_URL ?? LOCAL_URL;
const isRemote = !databaseUrl.startsWith("file:");
const confirmed = process.argv.includes("--yes");

const describeTarget = (): string => {
  if (!isRemote) return `local SQLite file (${databaseUrl})`;
  const host = databaseUrl.replace(/^\w+:\/\//, "");
  return `REMOTE database (${host})`;
};

const run = (label: string, command: string, args: string[]): void => {
  console.log(`\n▸ ${label}`);
  const result = spawnSync(command, args, { stdio: "inherit", shell: true });
  if (result.status !== 0) {
    console.error(`\n✗ ${label} failed.`);
    process.exit(result.status ?? 1);
  }
};

console.log(`Bootstrapping against ${describeTarget()}`);

if (isRemote && !confirmed) {
  console.error(
    [
      "",
      "✗ Refusing to bootstrap a remote database without confirmation.",
      "",
      "  Seeding deletes and recreates the demo account's data. If you really",
      "  mean to do that against this database, re-run with:",
      "",
      "      yarn bootstrap --yes",
      "",
      "  To target the local file instead, unset TURSO_DATABASE_URL.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

run("Applying the database schema", "drizzle-kit", ["push", "--force"]);
run("Loading sample data", "tsx", ["scripts/seed.ts"]);

console.log(`
✓ Ready. Start the app with:

    yarn dev
`);
