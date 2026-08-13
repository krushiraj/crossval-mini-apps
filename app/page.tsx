import Link from "next/link";
import { ArrowRight, Calculator, PiggyBank, Receipt } from "lucide-react";

import { SignOutButton } from "@/components/sign-out-button";
import { Button } from "@/components/ui";
import { getSessionUser } from "@/lib/session";

const apps = [
  {
    href: "/pricing",
    icon: Calculator,
    name: "Multi-Rate Pricing Calculator",
    description:
      "Documents with line items, per-line discounts and tax, draft/finalize lifecycle, and a date-range summary report.",
    highlights: ["Server-side totals", "Immutable once finalized", "Duplicate to new draft"],
  },
  {
    href: "/orders",
    icon: Receipt,
    name: "Orders and Settlements",
    description:
      "Orders with line items, an append-only payment ledger with partial payments, and a dashboard of amounts due.",
    highlights: ["Derived status", "Over-payment rejected", "Idempotent payments"],
  },
  {
    href: "/planner",
    icon: PiggyBank,
    name: "Plan vs Actual Tracker",
    description:
      "Monthly targets per category, actuals with CSV import, a variance report with a chart, and locked periods.",
    highlights: ["Variance analysis", "CSV import", "Period close"],
  },
];

const HomePage = async () => {
  const user = await getSessionUser();

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <header className="mb-10 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            CrossVal take-home
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Three mini full-stack apps</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            One Next.js application, one account, three assignments. Every amount is stored in
            integer minor units and computed on the server; the browser only ever displays what the
            API returns.
          </p>
        </div>
        {user ? (
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-white px-3 py-1.5 text-xs text-slate-600 ring-1 ring-slate-200">
              Signed in as {user.email}
            </span>
            <SignOutButton />
          </div>
        ) : (
          <div className="flex gap-2">
            <Link href="/login">
              <Button variant="secondary">Sign in</Button>
            </Link>
            <Link href="/signup">
              <Button>Create account</Button>
            </Link>
          </div>
        )}
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {apps.map((app) => (
          <Link
            key={app.href}
            href={app.href}
            className="group flex flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <app.icon className="h-5 w-5 text-slate-400" />
            <h2 className="mt-3 text-sm font-semibold text-slate-900">{app.name}</h2>
            <p className="mt-1.5 flex-1 text-xs leading-relaxed text-slate-600">
              {app.description}
            </p>
            <ul className="mt-3 space-y-1">
              {app.highlights.map((highlight) => (
                <li key={highlight} className="text-xs text-slate-500">
                  · {highlight}
                </li>
              ))}
            </ul>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-slate-900">
              Open
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default HomePage;
