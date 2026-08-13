# CrossVal Take-Home: Three Mini Full-Stack Apps

Three assignments built as one Next.js application, with one account and one deployment:

| App | Route | What it does |
| --- | --- | --- |
| Multi-Rate Pricing Calculator | `/pricing` | Documents with line items, per-line discounts and tax, a draft/finalize lifecycle, and a date-range summary report |
| Orders and Settlements | `/orders` | Orders with line items, an append-only payment ledger with partial payments, and a dashboard of amounts due |
| Plan vs Actual Tracker | `/planner` | Monthly targets per category, actuals with CSV import, a variance report with a chart, and locked periods |

**Live URL:** https://crossval-mini-apps.vercel.app

Sign in with **demo@crossval.test / demo12345**, or create your own account.

---

## Quick start

You need Node.js 20 or newer and Yarn 1.x.

```bash
yarn install
yarn bootstrap     # creates the database and loads the sample data
yarn dev           # http://localhost:3000
```

That is the whole setup. **You don't need an environment file or a cloud account to run this locally.** `TURSO_DATABASE_URL` falls back to `file:./local.db`, a SQLite file that `yarn bootstrap` creates from scratch. Production points the same variable at Turso, which speaks the same protocol.

Sign in with the seeded account **demo@crossval.test / demo12345**, or create your own at `/signup`.

One safety note: `yarn bootstrap` refuses to run against a remote database unless you pass `--yes`. Seeding deletes and recreates the demo account's data, and that should never happen to a deployed database because someone had a variable exported in their shell.

| Command | What it does |
| --- | --- |
| `yarn bootstrap` | Apply the schema and load the sample data (`--yes` to allow a remote target) |
| `yarn dev` | Development server |
| `yarn test` | Unit tests for the calculation modules |
| `yarn e2e` | Playwright browser tests, against their own database |
| `yarn typecheck` / `yarn lint` | `tsc --noEmit` / ESLint |
| `yarn db:push` / `yarn db:seed` | The two steps `bootstrap` runs |
| `yarn db:generate` / `yarn db:studio` | Generate a migration / browse the data |

---

## Architecture

```
app/
  page.tsx                  Landing page linking the three apps
  login/  signup/           Shared email and password auth
  api/auth/[...all]/        Better Auth handler
  pricing/  orders/  planner/               UI for each app
  api/pricing/  api/orders/  api/planner/   REST API for each app
lib/
  money.ts                  The only place anything is rounded
  calc/                     Pure calculation modules, no database or HTTP
  db/schema.ts              Drizzle schema for all three apps
  api-utils.ts              Auth guard, validation, error shape, audit helper
  api-client.ts             Browser client that reads the error shape back
  errors.ts                 Error types shared by the calc modules and the API
components/                 Shared UI kit and app chrome
tests/                      Vitest suites for the calculation modules
```

**Stack:** Next.js 16 (App Router, Route Handlers as the REST API), TypeScript, Drizzle ORM, Turso (libSQL/SQLite), Better Auth, Zod, TanStack Query, Tailwind, Recharts, Vitest, Playwright.

### Why all three, and why one app

I built all three assignments rather than picking one. That was deliberate. Each one leans on something different: careful money maths in the first, a payment ledger with derived state in the second, time-series reporting with locked periods in the third. Doing all three shows more than doing any single one of them well.

Three separate projects would have meant writing sign-in, per-user data isolation, money handling, validation and error handling three times over, and probably three slightly different ways. So all of that is shared. Each app then owns only the part that makes it different: its own pages, its own API namespace, and its own calculation module.

Sharing the foundation is what made three of them realistic in the time. It has a useful side effect too. Because the plumbing is written once, the parts actually worth reading are small: three pure calculation modules with no database or HTTP in them, tested directly against the sample numbers in the briefs.

---

## Money handling and rounding

This is the part worth reading closely. The same rules apply in all three apps.

**How amounts are stored.** Every amount is a whole number of cents, in the database, in the API and in every calculation. No decimal is ever stored or added up, so the `0.1 + 0.2` problem can't happen. Percentages are whole basis points: 100% is 10,000, so 5% is 500 and 12.5% is 1,250.

`lib/money.ts` wraps this in a `Money` type that carries its currency, refuses to mix currencies, and only offers operations that are safe on whole cents: `add`, `subtract`, `timesQuantity` (whole quantities only) and `applyRate` (basis points). There is deliberately no divide or multiply-by-a-fraction, because that is where rounding bugs come from.

**Rounding: half up, away from zero.** `divideRoundHalfUp` does the division with whole numbers rather than `Math.round(a / b)`. That would be wrong twice over: it adds floating point error, and it rounds ties upwards, which treats a refund differently from a charge.

**Rounding happens once per line**, at the moment a percentage becomes an amount. `Money.applyRate` is the only place in the codebase that rounds. Line amounts are rounded once, and document and report totals are plain sums of those rounded numbers, so nothing is ever rounded twice and the totals always reconcile.

**Worked example**, the sample document from the pricing brief:

| Line | Qty | Unit price | Discount | Tax | Subtotal | Discount | After discount | Tax | Line total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Widget A | 2 | 100.00 | 10% | 5% | 200.00 | 20.00 | 180.00 | 9.00 | 189.00 |
| Widget B | 1 | 50.00 | — | 5% | 50.00 | 0.00 | 50.00 | 2.50 | 52.50 |
| Service fee | 1 | 200.00 | $20 fixed | — | 200.00 | 20.00 | 180.00 | 0.00 | 180.00 |

Widget A in cents: subtotal `2 × 10000 = 20000`, discount `20000 × 1000 / 10000 = 2000`, discounted `18000`, tax `18000 × 500 / 10000 = 900`, total `18900`.

Document totals: subtotal **450.00**, total discount **40.00**, total tax **11.50**, grand total **421.50**. The test suite also asserts that `grand total = subtotal - discount + tax`.

Order of operations, as the brief sets out: **discount comes off first, then tax is worked out on what's left**. Tax on Widget A is 5% of 180.00, not of 200.00.

**Half a cent.** 10% of $0.05 is $0.005, which rounds up to **$0.01**. Three lines that each round up by half a cent produce 3 cents of tax on the document, because each line rounds on its own and the total is their exact sum rather than a re-rounded figure.

**What isn't here, on purpose.** Splitting one amount across several lines without losing a cent (the largest-remainder problem) doesn't come up, because every amount is worked out from its own line rather than divided out of a total. Multiple currencies, FX and double-entry bookkeeping are out of scope too. See [What I would improve](#what-i-would-improve-before-production).

---

## Signing in, and keeping accounts apart

Email and password through Better Auth, one instance shared by all three apps, so you sign up once and the session works across `/pricing`, `/orders` and `/planner`.

Every API route resolves the session with `requireUser()` before it does anything else, and filters every query by `userId`. A row belonging to someone else returns **404, not 403**, because a 403 would confirm that the row exists and tell you something about another account. Pages have their own guard, `requirePageUser()`, which redirects signed-out visitors before the page renders, so a protected page never appears and then vanishes.

---

## How the API is put together

Every route that changes something follows the same order:

```
check who's asking -> check the input -> load the row and confirm it's theirs
  -> check the business rule -> write the change and its audit entry together
  -> return what the server worked out
```

Routes don't invent their own order. The client never sends a computed total and never decides whether something is allowed. It re-renders from whatever the API sends back.

**One error shape, everywhere:**

```json
{
  "error": {
    "code": "OVER_PAYMENT",
    "message": "Payment of $601.00 exceeds the amount due. The maximum you can record is $600.00.",
    "details": { "maxAllowedMinorUnits": 60000 }
  }
}
```

| Status | Meaning |
| --- | --- |
| 400 | Bad input. `details.fields` maps each failing field to a message, so a form can mark all of them at once instead of one per attempt. |
| 401 | Not signed in. |
| 404 | Doesn't exist, or belongs to someone else. |
| 409 | The request was fine but a rule says no: `DOCUMENT_FINALIZED`, `OVER_PAYMENT`, `PERIOD_LOCKED`, `ORDER_HAS_PAYMENTS`. |

In the browser, `lib/api-client.ts` turns that back into a typed error. Field errors are shown against the inputs that caused them, and rule violations appear as a toast carrying the server's own message, which tells you what to do rather than just that something failed.

---

## The audit trail, and treating payments as a ledger

One `audit_log` table serves all three apps. It records documents being finalized and duplicated, payments recorded **and refused**, and periods locked and unlocked.

Audit rows are written **in the same transaction as the change they describe**. An audit entry that can go missing while the change it records survives isn't an audit trail, so the two commit together or not at all. That's why the helper takes the transaction rather than the database.

The `payments` table is treated as a ledger rather than as editable state. It is append-only, with no update or delete endpoint anywhere. An order's balance is always the sum of its payment rows, never a stored number, and a correction is a further row rather than a rewrite. Order status is worked out the same way, so it can't drift from the payments underneath it.

---

## Testing

```bash
yarn test   # 109 unit tests, the calculation modules
yarn e2e    # 18 browser tests, against a production build
```

`yarn e2e` uses its **own** database, `./e2e.db`, and reseeds it before every run. It never touches your development data, so you can run the suite at any point without losing what you were working on, and the tests get predictable fixtures instead of whatever state the app happened to be left in.

**Unit tests.** The calculation modules are plain functions with no database or HTTP, which makes them both the most valuable thing to test and the easiest to test properly. Each brief's sample data is a fixture, so the suite fails the moment a documented number stops matching: the pricing example's 450.00 / 40.00 / 11.50 / 421.50, the order scenario of $400 then $600 then a refused $1, and the planner's variance table. Rounding is tested at the half-cent boundary in both directions, including negative amounts.

**Browser tests.** The unit tests prove the numbers are right. These prove they reach the screen, and that a refused write tells the user why instead of failing quietly. They cover the signed-out redirect, signing out, the sample document's totals, amounts previewing as you type, Enter saving a line, an out-of-range value marking its row and blocking the save, finalizing keeping unsaved edits, a finalized document being read-only with duplication offered instead, all four order statuses and the status filter, an over-payment showing the maximum you can record, the variance table with a missing actual, a locked month being read-only, and every page staying free of sideways scrolling at 700px wide.

Tests that change a document create their own and delete it afterwards, so they don't depend on or damage the seeded fixtures. Signing in happens once in a setup project and is shared, because signing in per test hits the auth rate limit and then you're debugging throttling instead of your app.

---

## Deployment

Vercel for the app, Turso for the database, both on free tiers. The steps and the two things that catch people out are in [DEPLOYMENT.md](DEPLOYMENT.md).

---

# App 1: Multi-Rate Pricing Calculator (`/pricing`)

Documents with line items, per-line discounts and tax, a draft and finalized lifecycle, and a summary report across a range of issue dates.

### Calculation and rounding

Covered in full under [Money handling and rounding](#money-handling-and-rounding), worked example included. Briefly: whole cents, percentages as basis points, discount first and tax on what's left, rounded once per line, document totals as exact sums of those rounded amounts.

All of it is in `lib/calc/pricing.ts`, a plain module with no database or HTTP, called by the API, the seed script and the tests. There is exactly one implementation.

### Where totals are worked out, and why the editor previews them

The brief asks that totals are computed on the server and that the client isn't the source of truth. That holds here:

- Every total that is **stored** comes from the server. The API recalculates all line and document amounts on every write and saves those. It never accepts a total from the client, because the request body has no field for one.
- After a save, the editor throws away what it was showing and re-renders from the server's response.
- Finalizing freezes the server's numbers. Nothing the browser produced is ever written down.

On top of that, the draft editor **previews** line and document amounts as you type, by calling that same `lib/calc/pricing.ts` in the browser. That's a trade-off, so it's worth being straight about:

- It only affects what you see. Previewed numbers are never sent, never saved, and are replaced by the server's own numbers on save.
- It can't disagree with the server, because it isn't a second implementation. It's the same module, and the unit tests that pin it to the brief's worked example pin both.
- The alternative was a preview endpoint returning server-computed amounts on every keystroke. That would follow the wording more literally, at the cost of a request per edit. Given the preview is thrown away and shares one implementation, that felt like ceremony rather than safety.

A row that isn't finished previews as "—" rather than a wrong number, and the totals panel falls back to the last saved figures until every row is valid, so a half-finished edit can never look like a real total.

### Finalizing, and what becomes read-only

| Status | What you can do |
| --- | --- |
| `draft` | Everything: edit the details, add, change or remove lines, delete the document |
| `finalized` | Nothing. Detail edits, line changes and deletion are all refused |

`POST /api/pricing/documents/:id/finalize` freezes the document. The status becomes `finalized`, `finalizedAt` is stamped, the totals stay exactly as they were, and an audit entry is written in the same transaction. Finalizing an empty document is refused.

Every write path goes through one guard, `assertDraft()` in `app/api/pricing/_lib.ts`, which throws:

```json
{ "error": { "code": "DOCUMENT_FINALIZED",
  "message": "This document is finalized and can no longer be edited. Duplicate it to make changes." } }
```

The rule is enforced by the API, not by hiding buttons. Calling `PATCH /api/pricing/documents/:id` or `PUT /api/pricing/documents/:id/lines` directly against a finalized document returns 409.

**Duplicate is implemented**, which is what makes immutability workable rather than annoying. `POST /api/pricing/documents/:id/duplicate` copies any document into a **new draft** and records where it came from in `duplicatedFromId`. That's the correction path: you supersede a finalized document rather than editing history.

### Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/pricing/documents` | `?status=&from=&to=` |
| POST | `/api/pricing/documents` | Optionally with lines |
| GET / PATCH / DELETE | `/api/pricing/documents/:id` | PATCH and DELETE refused once finalized |
| PUT | `/api/pricing/documents/:id/lines` | Replace the whole set |
| POST | `/api/pricing/documents/:id/lines` | Add one line |
| PATCH / DELETE | `/api/pricing/documents/:id/lines/:lineId` | Change or remove one line |
| POST | `/api/pricing/documents/:id/finalize` | |
| POST | `/api/pricing/documents/:id/duplicate` | Returns a new draft |
| GET | `/api/pricing/report` | `?from=&to=`, returns count, grand total, tax, discount |

### Decisions and trade-offs

- **A fixed discount bigger than its line is refused, not trimmed to fit.** The error carries the maximum allowed. Trimming would turn a mistyped discount into a free line and nobody would notice. A discount exactly equal to the subtotal is allowed and gives a zero line.
- **A line has either a percent discount or a fixed one, never both.** There's one `discountType` and one `discountValue`, so it isn't possible to set both rather than merely being checked for.
- Discount and tax percentages are both capped at 100%.
- The summary report adds up the **stored** document totals rather than recalculating from line items. Totals are rewritten on every line change so the two can't diverge, and the report stays one indexed query as the data grows.
- **Replacing the whole line set is the path the UI uses.** It deletes and reinserts the lines with fresh totals in one transaction, which is simpler and safer than working out a diff. The per-line endpoints exist because the brief asks for line CRUD, and they reuse the same helper by loading the full set, applying one change and writing it back, so single-line edits and whole-set replacement can never round differently.
- **A duplicate is dated today**, not on the original's issue date. The title and customer carry over unchanged, since the copy is a new document being drafted now.
- The summary report covers **both drafts and finalized documents** in range. The brief doesn't ask for a status filter, and leaving drafts out would make the totals disagree with the document list.
- Lines keep whatever order they're sent in. There's no drag to reorder.
- Documents are listed newest first, with no pagination yet.

---

# App 2: Orders and Settlements (`/orders`)

Orders with line items, an append-only payment ledger with partial payments, and a dashboard of what's still owed.

### How status is worked out

Status is **never stored**. `deriveStatus()` in `lib/calc/orders.ts` works it out from the order total, the sum of its payments and the due date, so it can't drift from the ledger it describes.

| Status | When |
| --- | --- |
| `paid` | Payments add up to the order total or more, and the total is above zero |
| `overdue` | Not fully paid, and today is past the due date |
| `partially_paid` | Something paid, still owing, not past due |
| `pending` | Nothing paid, not past due |

Two orderings matter, and both are tested:

- **Paid beats overdue.** An order that went past its due date while unpaid but has since been settled reads as `paid`. The status says where it stands now, not where it's been. This is the edge case the brief asks about.
- **Overdue beats partly paid.** Past the date and still short is `overdue`, whether nothing or nearly everything has been paid. There's no "overdue but partly paid" state. The amount still owing is shown next to it, so nothing is lost.

An order due *today* isn't late yet.

**An order has to come to at least $0.01.** A zero total used to read as `paid` the moment it was created, because nothing was owed and nothing had been paid, which is a misleading thing for a ledger to say about money that never moved. `assertOrderIsPayable()` now refuses to save one, on both the create and the replace-lines paths:

```json
{ "error": { "code": "ZERO_TOTAL_ORDER",
  "message": "An order must come to at least $0.01. Check the unit prices.",
  "details": { "field": "lines" } } }
```

The rule sits outside `computeOrderTotal()` on purpose, so the live total still previews as you type and only saving is refused. `deriveStatus()` treats a zero total as `pending` regardless, which covers any row written before the rule existed. An individual line may still be free, as long as the order isn't.

### Payments, over-payment and the ledger

- Payments can never add up to more than the order total. An over-payment is refused with a message that says what you can actually pay: *"Payment of $601.00 exceeds the amount due. The maximum you can record is $600.00."* The maximum is in `details` as a number too, so the form can offer to correct it without reading the sentence.
- An order can have as many payments as you like. The amount paid is always the sum of those rows, never a stored balance.
- **There is deliberately no endpoint to change or delete a payment.** The table is a ledger, so a correction is another row rather than a rewrite. A refund would be a negative row. See [What I would improve](#what-i-would-improve-before-production).
- A refused over-payment still writes an audit row, in its own transaction since the first one rolled back. Someone trying to overpay is worth knowing about.

### Two payments at once

This is the one write where two requests racing each other could both look fine and together take the order past its total.

The check runs **inside** the transaction that inserts the payment. It re-reads the sum of existing payments, calls `assertPaymentAllowed()`, and only then inserts. It doesn't trust a balance read before the transaction opened, and it never trusts an amount owing sent by the client. SQLite serializes writers, so the second of two racing transactions can't start writing until the first commits, and it always sees that first payment when it re-reads the sum. Both checks can't pass against a balance that only allows one of them.

Separately, `POST /api/orders/:id/payments` accepts an optional **`Idempotency-Key`** header. A client that timed out and retried a request that had actually succeeded gets the original payment back instead of paying twice.

Keys are unique **per user across all their orders** rather than per order. That's the stricter of the two, and it matches how clients generate them, one fresh key per submission. Replaying a key on the order it belongs to returns the original payment. Reusing it on a different order is refused with `IDEMPOTENCY_KEY_REUSED` rather than quietly crediting the wrong order.

On Postgres the equivalent would be a row lock on the order, or a serializable transaction with a retry. The shape of the code wouldn't change, only the locking.

### Editing an order after it's been paid

**Orders stay fully editable until the first payment.** After that the line items and total become read-only, because changing the total underneath an existing payment would retroactively change what "paid in full" meant. The customer name and due date stay editable, since neither has any arithmetic relationship to the ledger. Deleting is only allowed while an order has no payments.

### Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/orders` | `?status=` filters on the worked-out status |
| POST | `/api/orders` | The server totals the lines |
| GET / PATCH / DELETE | `/api/orders/:id` | Detail includes payments and audit history |
| PUT | `/api/orders/:id/lines` | Refused once there are payments |
| POST | `/api/orders/:id/payments` | Honours `Idempotency-Key` |

### Decisions and trade-offs

- The order total is the subtotal. No order-level tax or discount, as the brief says.
- An order needs at least one line.
- The dashboard works out each row's status in the API response rather than in SQL, which keeps one implementation of the rules. At scale that would move into an indexed query, or a stored column refreshed when payments are written.

---

# App 3: Plan vs Actual Tracker (`/planner`)

Monthly targets per category, actuals with CSV import, a variance report with a chart, and months you can close.

### Variance, and what happens at the edges

Variance is actual minus plan, so a negative number means you spent less than planned. The percentage is variance over plan, to two decimal places.

- **Plan of 0** gives no percentage, shown as "—". There isn't a meaningful percentage of zero, and the report never shows `NaN` or `Infinity`. The variance amount is still shown, since actual minus zero is perfectly well defined.
- **No actual logged** shows "—" for the actual, the variance and the percentage, consistently across the table, the chart and the API. The brief allows treating a missing actual as zero instead. I chose not to, because "nothing has been logged yet" and "zero was spent" are different facts, and treating them the same would show a made-up -100% for a month nobody has reported on. In the brief's sample data that's the 2026-02 Marketing row.

Reproducing the brief's sample table, from the seeded data and asserted in `tests/planner-calc.test.ts`:

| Month | Category | Plan | Actual | Variance | Variance % |
| --- | --- | --- | --- | --- | --- |
| 2026-01 | Marketing | 5,000 | 4,800 | -200 | -4.00% |
| 2026-01 | Payroll | 20,000 | 20,500 | +500 | +2.50% |
| 2026-02 | Marketing | 5,000 | — | — | — |
| 2026-02 | Payroll | 20,000 | 19,800 | -200 | -1.00% |

There can be several actual entries for one category and month. The report adds them up, which is what makes CSV import and drilling into a figure straightforward rather than destructive.

### Locking a month

**Locking is per calendar month.** A row in `period_locks` means that month is closed. Deleting it opens the month again.

It's enforced **on the server, on every write path**: targets, individual actuals, edits to actuals, and each row of a CSV import. They all go through one guard, `assertMonthUnlocked()` in `app/api/planner/_lib.ts`:

```json
{ "error": { "code": "PERIOD_LOCKED",
  "message": "Jan 2026 is locked. Unlock the period before editing its plans or actuals.",
  "details": { "month": "2026-01" } } }
```

The UI disables the controls too, but that's a convenience rather than the mechanism. Calling the API directly against a locked month returns 409. Editing an actual so that it *moves into* a locked month is refused as well, which is the case that's easy to miss.

**Deleting a category is refused if it has figures in a closed month.** A delete takes the category's plans and actuals with it, so allowing it would rewrite a closed month's report without anyone unlocking anything. That was the back door into a locked period, and it's now shut by `assertCategoryNotInLockedPeriod()`, which runs inside the delete's transaction so a month locked at the same moment can't slip past:

```json
{ "error": { "code": "CATEGORY_IN_LOCKED_PERIOD",
  "message": "This category has figures in Dec 2025, which is locked. Unlock it before deleting the category.",
  "details": { "months": ["2025-12"] } } }
```

Unlock the month, delete the category, lock it again. The audit log keeps all three steps.

### CSV import

Takes the format from the brief:

```csv
month,category,amount
2026-01,Marketing,4800
2026-01,Payroll,20500
2026-02,Payroll,19800
```

Validation happens **on the server**. The browser only reads the file's text. Each row is checked for a `YYYY-MM` month, a category that exists for this user (matched without caring about case), an amount that's a non-negative number with at most two decimal places, and a target month that isn't locked.

The import is **all or nothing**. If any row fails, nothing is written and the response lists every failing row by its number, counting from 1 and ignoring the header, so the numbers match what you see in your file:

```json
{ "error": { "code": "CSV_IMPORT_FAILED",
  "message": "The CSV had 3 invalid rows. Nothing was imported.",
  "details": { "rows": [
    { "row": 2, "message": "Invalid month \"26-13\". Expected format YYYY-MM." },
    { "row": 3, "message": "Unknown category \"Nonexistent\"." },
    { "row": 4, "message": "Invalid amount \"abc\". Expected a non-negative number with up to 2 decimal places." }
  ] } } }
```

A half-applied import is worse than a refused one, because you're left unsure which rows landed.

### Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| GET / POST | `/api/planner/categories` | Names unique per user |
| PATCH / DELETE | `/api/planner/categories/:id` | |
| GET | `/api/planner/plans` | `?from=&to=` |
| PUT | `/api/planner/plans` | Upsert by category and month |
| GET / POST | `/api/planner/actuals` | |
| PATCH / DELETE | `/api/planner/actuals/:id` | |
| POST | `/api/planner/actuals/import` | CSV, all or nothing |
| GET / POST | `/api/planner/locks` | |
| DELETE | `/api/planner/locks/:month` | |
| GET | `/api/planner/report` | `?from=YYYY-MM&to=YYYY-MM` |

### Two interface decisions

**The month is picked from two dropdowns rather than `<input type="month">`.** That input gives you a proper picker in Chrome but a plain text box in Safari and Firefox, where you end up typing `2026-07` and guessing the format. Two dropdowns behave the same everywhere and can't hold an invalid month.

**Under budget is green, over budget is red.** Variance is actual minus plan, so for spending the sign reads the opposite way round to the usual financial convention. The rule lives in one module, `app/planner/variance-tone.ts`, shared by the grid, the report table, the summary figure and the chart, so they can't disagree with each other. If income categories were ever added, the colour would need to depend on the category rather than on the sign.

### Querying at scale

The dataset here is small, but the schema is already shaped for the queries the report actually runs:

- `plans` is unique on user, category and month. That index both enforces one target per category-month and serves the upsert.
- `actuals` is indexed on user and month, and on user, category and month, which covers the report's range scan and per-category drill-down.
- Months are stored as `YYYY-MM` text, so a date-range filter is a plain `BETWEEN` on an indexed column rather than a computed expression, and stays index-eligible.

If per-row aggregation stopped being cheap, the next steps in order would be: total the actuals by category and month in SQL rather than in application code, add a covering index, then keep a per-user monthly rollup refreshed on write, since actuals are written far less often than the report is read.

### Decisions and trade-offs

- Categories are user-created with full CRUD, though the brief allowed a fixed list. Names are unique per user.
- Locking is per month rather than per quarter. A quarter is three month rows, so the finer granularity loses nothing.
- Locks are per user, and you can lock a month that hasn't happened yet.
- Moving an actual **into** a locked month is refused, not just editing one already inside a locked month. Both the current month and the target month are checked, so you can't sidestep a lock by relocating an entry across the boundary.
- **Deleting a category also deletes its targets and actuals, including ones in locked months.** The reasoning is that closing a period protects the numbers, not the list of categories. It's a defensible reading of the brief but the riskier one. In production I'd either soft-delete categories or refuse to delete one while a locked period still refers to it.

---

## Smaller things worth mentioning

**The page never shifts sideways.** A tall page shows a scrollbar and a short one doesn't, which changes the viewport width and slides a centred layout across as you move between them. The root element reserves that space permanently, so the content width is identical on every page.

**Wide tables scroll inside their own box.** A full-width table shrinks to its container and squeezes its columns, which was enough to crush a dropdown down to just its arrows. Tables holding form controls declare a minimum width instead, so the table scrolls and the page itself never does.

**Forms behave the way you'd expect.** Every form submits on Enter and has exactly one submit button. Buttons default to `type="button"`, because a plain button inside a form submits it, which would have made "Add line" save the whole document. Labels wrap their inputs, so clicking a label focuses the field and screen readers announce the two together.

## What I would improve before production

**Correctness and data model.** Move to Postgres, and use proper double-entry bookkeeping for the orders app (accounts, journal entries, balanced postings) rather than the one-sided ledger here. Add refunds as negative entries with their own reason codes. Add multiple currencies: the `Money` type already carries one and refuses to mix, so what's left is a currency column per document and order, stored exchange rates, and per-currency precision, since not every currency has two decimal places.

**Two writers at once.** SQLite's single-writer model does the heavy lifting today. On Postgres I'd take an explicit lock on the order row when recording a payment, or run the transaction as serializable with a retry, and add a load test that fires concurrent payments at one order to prove the rule holds rather than reasoning about it.

**Testing.** 109 unit tests cover the calculation modules and 18 browser tests cover the main flows. The gap is API-level tests against a real database for each guard: finalized immutability, over-payment, period locks, idempotent retries, CSV atomicity. I checked all of those by hand over HTTP while building, and they should be automated rather than re-checked by hand.

**Running it.** Structured request logging with correlation IDs, error reporting, and a metric on refused writes by error code, since a spike in over-payments or locked-period edits is a product signal rather than noise. Rate limiting on the auth endpoints. Backups, and a restore you've actually practised.

**Accounts.** Email verification and password reset, both off here because no mail is wired up. Session revocation. Organisation-level accounts so data belongs to a workspace rather than one person, with roles for who can finalize a document or close a month.

**Product.** Pagination and server-side filtering on every list. CSV and PDF export. Clicking a figure in the report to see the entries behind it. Version columns so two people editing the same draft can't silently overwrite each other.

**Accessibility.** A full keyboard and screen-reader pass, focus handling in the line-item editor, and empty and error states reviewed against real content rather than seed data.
