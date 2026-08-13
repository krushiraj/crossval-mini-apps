"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Plus, Trash2, Unlock, Upload } from "lucide-react";
import { toast } from "sonner";

import { ApiError } from "@/lib/api-client";
import { computeVariance } from "@/lib/calc/planner";
import { formatMonth } from "@/lib/dates";
import { formatMoney, minorUnitsToInput, parseAmountToMinorUnits } from "@/lib/utils";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  LoadingRow,
  Select,
  Table,
  Td,
  Textarea,
  Th,
} from "@/components/ui";
import { PageHeader } from "@/components/app-shell";
import type { Actual } from "@/app/planner/_api";
import { plannerApi, plannerKeys } from "@/app/planner/_api";
import { varianceTextClass } from "@/app/planner/variance-tone";

const currentMonth = (): string => {
  return new Date().toISOString().slice(0, 7);
};

const PlannerPage = () => {
  const [month, setMonth] = React.useState(currentMonth);
  const queryClient = useQueryClient();

  const categoriesQuery = useQuery({
    queryKey: plannerKeys.categories,
    queryFn: () => plannerApi.listCategories(),
  });
  const plansQuery = useQuery({
    queryKey: plannerKeys.plans(month, month),
    queryFn: () => plannerApi.listPlans(month, month),
  });
  const actualsQuery = useQuery({
    queryKey: plannerKeys.actuals(month, month),
    queryFn: () => plannerApi.listActuals(month, month),
  });
  const locksQuery = useQuery({
    queryKey: plannerKeys.locks,
    queryFn: () => plannerApi.listLocks(),
  });

  const categories = categoriesQuery.data?.categories ?? [];
  const plans = plansQuery.data?.plans ?? [];
  const actuals = actualsQuery.data?.actuals ?? [];
  const locks = locksQuery.data?.locks ?? [];
  const isLocked = locks.some((lock) => lock.month === month);

  const invalidateMonthData = () => {
    queryClient.invalidateQueries({ queryKey: plannerKeys.plans(month, month) });
    queryClient.invalidateQueries({ queryKey: plannerKeys.actuals(month, month) });
  };

  const lockMutation = useMutation({
    mutationFn: () => plannerApi.lockMonth(month),
    onSuccess: () => {
      toast.success(`${formatMonth(month)} is now locked.`);
      queryClient.invalidateQueries({ queryKey: plannerKeys.locks });
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not lock the period."),
  });

  const unlockMutation = useMutation({
    mutationFn: () => plannerApi.unlockMonth(month),
    onSuccess: () => {
      toast.success(`${formatMonth(month)} is unlocked.`);
      queryClient.invalidateQueries({ queryKey: plannerKeys.locks });
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not unlock the period."),
  });

  const loading = categoriesQuery.isLoading || plansQuery.isLoading || actualsQuery.isLoading;

  return (
    <div>
      <PageHeader
        title="Plans & actuals"
        description="Set a monthly target per category, log what actually happened, and close the month when it's final."
        action={
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
            {isLocked ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => unlockMutation.mutate()}
                loading={unlockMutation.isPending}
              >
                <Unlock className="h-3.5 w-3.5" /> Unlock month
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => lockMutation.mutate()}
                loading={lockMutation.isPending}
              >
                <Lock className="h-3.5 w-3.5" /> Lock month
              </Button>
            )}
          </div>
        }
      />

      {isLocked ? (
        <div
          role="status"
          className="mb-4 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800"
        >
          <Lock className="h-4 w-4 shrink-0" />
          <span>
            {formatMonth(month)} is locked. Plans and actuals are read-only until you unlock it.
          </span>
        </div>
      ) : null}

      {loading ? (
        <Card>
          <LoadingRow />
        </Card>
      ) : categories.length === 0 ? (
        <Card>
          <EmptyState
            title="No categories yet"
            description="Create a spending category before setting targets or logging actuals."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <CategoryGrid
            month={month}
            categories={categories}
            plans={plans}
            actuals={actuals}
            isLocked={isLocked}
            onChanged={invalidateMonthData}
          />

          <div className="grid gap-6 md:grid-cols-2">
            <AddActualForm
              month={month}
              categories={categories}
              isLocked={isLocked}
              onCreated={invalidateMonthData}
            />
            <CsvImportPanel onImported={invalidateMonthData} />
          </div>
        </div>
      )}
    </div>
  );
};

// --------------------------------------------------------------------------
// Category x month grid
// --------------------------------------------------------------------------

const CategoryGrid = ({
  month,
  categories,
  plans,
  actuals,
  isLocked,
  onChanged,
}: {
  month: string;
  categories: { id: string; name: string }[];
  plans: { categoryId: string; amountMinorUnits: number }[];
  actuals: Actual[];
  isLocked: boolean;
  onChanged: () => void;
}) => {
  const planByCategory = new Map(plans.map((plan) => [plan.categoryId, plan.amountMinorUnits]));
  const actualsByCategory = new Map<string, Actual[]>();
  for (const actual of actuals) {
    const list = actualsByCategory.get(actual.categoryId) ?? [];
    list.push(actual);
    actualsByCategory.set(actual.categoryId, list);
  };

  // Totals come from what's saved on the server, not what's being typed —
  // the row above previews the typed value, this footer shows what's stored.
  const totalPlanMinorUnits = plans.reduce((sum, plan) => sum + plan.amountMinorUnits, 0);
  const totalActualMinorUnits =
    actuals.length > 0 ? actuals.reduce((sum, actual) => sum + actual.amountMinorUnits, 0) : null;
  const totals = computeVariance({
    planMinorUnits: totalPlanMinorUnits,
    actualMinorUnits: totalActualMinorUnits,
  });

  return (
    <Card>
      <CardHeader title={formatMonth(month)} description="Target vs. logged spend by category" />
      <Table className="min-w-[44rem]">
        <thead>
          <tr>
            <Th>Category</Th>
            <Th>Plan</Th>
            <Th>Actual (logged entries)</Th>
            <Th>Variance</Th>
          </tr>
        </thead>
        <tbody>
          {categories.map((category) => (
            <CategoryRow
              key={category.id}
              month={month}
              category={category}
              planMinorUnits={planByCategory.get(category.id) ?? null}
              entries={actualsByCategory.get(category.id) ?? []}
              isLocked={isLocked}
              onChanged={onChanged}
            />
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
            <Td className="font-semibold">Total</Td>
            <Td className="tabular-nums">{formatMoney(totals.planMinorUnits)}</Td>
            <Td className="tabular-nums">
              {totals.actualMinorUnits === null ? (
                <span className="text-slate-400">—</span>
              ) : (
                formatMoney(totals.actualMinorUnits)
              )}
            </Td>
            <Td className={`tabular-nums ${varianceTextClass(totals.varianceMinorUnits)}`}>
              {totals.varianceMinorUnits === null ? (
                <span className="text-slate-400">—</span>
              ) : (
                <>
                  {formatMoney(totals.varianceMinorUnits)}
                  {totals.variancePercent !== null ? ` (${totals.variancePercent}%)` : ""}
                </>
              )}
            </Td>
          </tr>
        </tfoot>
      </Table>
    </Card>
  );
};

const CategoryRow = ({
  month,
  category,
  planMinorUnits,
  entries,
  isLocked,
  onChanged,
}: {
  month: string;
  category: { id: string; name: string };
  planMinorUnits: number | null;
  entries: Actual[];
  isLocked: boolean;
  onChanged: () => void;
}) => {
  const [planInput, setPlanInput] = React.useState(
    planMinorUnits !== null ? minorUnitsToInput(planMinorUnits) : "",
  );
  const [planError, setPlanError] = React.useState<string | undefined>();

  // Re-syncs the input when the server value changes elsewhere (another tab,
  // a refetch). Adjusted during render, not in an effect — React's pattern
  // for state that tracks a prop.
  const [syncedPlanMinorUnits, setSyncedPlanMinorUnits] = React.useState(planMinorUnits);
  if (planMinorUnits !== syncedPlanMinorUnits) {
    setSyncedPlanMinorUnits(planMinorUnits);
    setPlanInput(planMinorUnits !== null ? minorUnitsToInput(planMinorUnits) : "");
  }

  const upsertPlanMutation = useMutation({
    mutationFn: (amountMinorUnits: number) =>
      plannerApi.upsertPlan({ categoryId: category.id, month, amountMinorUnits }),
    onSuccess: () => {
      toast.success(`Target saved for ${category.name}.`);
      setPlanError(undefined);
      onChanged();
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.fieldErrors) {
        setPlanError(Object.values(error.fieldErrors)[0]);
      } else {
        toast.error(error instanceof Error ? error.message : "Could not save the target.");
      }
    },
  });

  const deleteActualMutation = useMutation({
    mutationFn: (id: string) => plannerApi.deleteActual(id),
    onSuccess: () => {
      toast.success("Actual entry deleted.");
      onChanged();
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not delete the entry."),
  });

  const revertPlan = () => {
    setPlanInput(planMinorUnits !== null ? minorUnitsToInput(planMinorUnits) : "");
    setPlanError(undefined);
  };

  // A form per row can't work here — the actuals and variance live in sibling
  // cells — so Enter and Escape are handled on the input itself.
  const handlePlanKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      savePlan();
    } else if (event.key === "Escape") {
      event.preventDefault();
      revertPlan();
    }
  };

  const savePlan = () => {
    const amount = parseAmountToMinorUnits(planInput);
    if (amount === null || amount < 0) {
      setPlanError("Enter a valid non-negative amount.");
      return;
    };
    if (amount === planMinorUnits) return;
    upsertPlanMutation.mutate(amount);
  };


  // Can't wrap this cell in its own <form> — the actual entries and variance
  // live in sibling cells of the same row. Enter/Escape are handled directly instead.

  const actualTotal = entries.length > 0 ? entries.reduce((sum, entry) => sum + entry.amountMinorUnits, 0) : null;

  // Preview variance from what's typed, not just the saved plan, so it
  // updates live. Saving is still what actually persists the target.
  // An empty field previews as a 0 target (matches "no plan saved"); anything
  // else invalid previews as "—" instead of a stale or NaN value.
  const trimmedPlanInput = planInput.trim();
  const typedPlanMinorUnits = trimmedPlanInput === "" ? 0 : parseAmountToMinorUnits(planInput);
  const previewPlanMinorUnits =
    typedPlanMinorUnits !== null && typedPlanMinorUnits >= 0 ? typedPlanMinorUnits : null;
  const variance =
    previewPlanMinorUnits === null
      ? null
      : computeVariance({ planMinorUnits: previewPlanMinorUnits, actualMinorUnits: actualTotal });

  return (
    <tr>
      <Td className="align-top font-medium text-slate-900">{category.name}</Td>
      <Td className="align-top">
        <Field error={planError} className="max-w-[140px]">
          <Input
            value={planInput}
            onChange={(event) => setPlanInput(event.target.value)}
            onBlur={savePlan}
            onKeyDown={handlePlanKeyDown}
            disabled={isLocked || upsertPlanMutation.isPending}
            placeholder="0.00"
            inputMode="decimal"
          />
        </Field>
      </Td>
      <Td className="align-top">
        {entries.length === 0 ? (
          <span className="text-slate-400">—</span>
        ) : (
          <ul className="flex flex-col gap-1">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center gap-2 text-xs text-slate-700">
                <span className="tabular-nums">{formatMoney(entry.amountMinorUnits)}</span>
                {entry.note ? <span className="text-slate-400">— {entry.note}</span> : null}
                {!isLocked ? (
                  <button
                    type="button"
                    onClick={() => deleteActualMutation.mutate(entry.id)}
                    className="rounded text-slate-400 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                ) : null}
              </li>
            ))}
            <li className="mt-0.5 text-xs font-medium text-slate-900">
              Total: {formatMoney(actualTotal ?? 0)}
            </li>
          </ul>
        )}
      </Td>
      <Td className="align-top tabular-nums">
        {variance === null || variance.varianceMinorUnits === null ? (
          <span className="text-slate-400">—</span>
        ) : (
          <span className={varianceTextClass(variance.varianceMinorUnits)}>
            {formatMoney(variance.varianceMinorUnits)}
            {variance.variancePercent !== null ? ` (${variance.variancePercent}%)` : ""}
          </span>
        )}
      </Td>
    </tr>
  );
};

// --------------------------------------------------------------------------
// Add actual
// --------------------------------------------------------------------------

const AddActualForm = ({
  month,
  categories,
  isLocked,
  onCreated,
}: {
  month: string;
  categories: { id: string; name: string }[];
  isLocked: boolean;
  onCreated: () => void;
}) => {
  const [categoryId, setCategoryId] = React.useState(categories[0]?.id ?? "");
  const [amount, setAmount] = React.useState("");
  const [note, setNote] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  // Defaults the select to the first category once categories load.
  // Adjusted during render, not an effect, since it's just deriving state
  // from the prop.
  if (!categoryId && categories[0]) {
    setCategoryId(categories[0].id);
  }

  const mutation = useMutation({
    mutationFn: () => {
      const amountMinorUnits = parseAmountToMinorUnits(amount);
      if (amountMinorUnits === null || amountMinorUnits < 0) {
        throw new Error("INVALID_AMOUNT");
      };
      return plannerApi.createActual({
        categoryId,
        month,
        amountMinorUnits,
        note: note.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Actual logged.");
      setAmount("");
      setNote("");
      setFieldErrors({});
      onCreated();
    },
    onError: (error: unknown) => {
      if (error instanceof Error && error.message === "INVALID_AMOUNT") {
        setFieldErrors({ amountMinorUnits: "Enter a valid non-negative amount." });
        return;
      }
      if (error instanceof ApiError && error.fieldErrors) {
        setFieldErrors(error.fieldErrors);
        return;
      }
      toast.error(error instanceof Error ? error.message : "Could not log the actual.");
    },
  });

  return (
    <Card>
      <CardHeader title="Add actual" description={`Log spend for ${formatMonth(month)}`} />
      <CardBody>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <Field label="Category" error={fieldErrors.categoryId}>
            <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} disabled={isLocked}>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Amount" error={fieldErrors.amountMinorUnits}>
            <Input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              disabled={isLocked}
            />
          </Field>
          <Field label="Note (optional)" error={fieldErrors.note}>
            <Input value={note} onChange={(event) => setNote(event.target.value)} disabled={isLocked} />
          </Field>
          <Button type="submit" loading={mutation.isPending} disabled={isLocked || !categoryId}>
            <Plus className="h-3.5 w-3.5" /> Add actual
          </Button>
        </form>
      </CardBody>
    </Card>
  );
};

// --------------------------------------------------------------------------
// CSV import
// --------------------------------------------------------------------------

const CsvImportPanel = ({ onImported }: { onImported: () => void }) => {
  const [csv, setCsv] = React.useState("");
  const [rowErrors, setRowErrors] = React.useState<{ row: number; message: string }[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: () => plannerApi.importActuals(csv),
    onSuccess: (data) => {
      toast.success(`Imported ${data.imported} row${data.imported === 1 ? "" : "s"}.`);
      setCsv("");
      setRowErrors([]);
      onImported();
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.code === "CSV_IMPORT_FAILED") {
        const rows = (error.details?.rows as { row: number; message: string }[] | undefined) ?? [];
        setRowErrors(rows);
        toast.error("The CSV had errors. Nothing was imported.");
        return;
      }
      setRowErrors([]);
      toast.error(error instanceof Error ? error.message : "Could not import the CSV.");
    },
  });

  // Reads the raw file text instead of parsing it client-side — the server
  // does the real parsing, and re-serializing rows first could subtly
  // reformat what the user uploaded.
  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsv(text);
    setRowErrors([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <Card>
      <CardHeader
        title="Import actuals from CSV"
        description="month,category,amount — one row per entry"
      />
      <CardBody>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (csv.trim().length === 0) return;
            mutation.mutate();
          }}
        >
          <Textarea
            rows={6}
            aria-label="CSV data"
            value={csv}
            onChange={(event) => setCsv(event.target.value)}
            placeholder={"month,category,amount\n2026-01,Marketing,4800"}
          />
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
            <Button type="button" variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" /> Choose file
            </Button>
            <Button type="submit" size="sm" loading={mutation.isPending} disabled={csv.trim().length === 0}>
              Import
            </Button>
          </div>

          {rowErrors.length > 0 ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2">
              <p className="mb-1 text-xs font-semibold text-red-800">
                {rowErrors.length} row{rowErrors.length === 1 ? "" : "s"} failed — nothing was imported:
              </p>
              <ul className="flex flex-col gap-0.5">
                {rowErrors.map((error, index) => (
                  <li key={index} className="text-xs text-red-700">
                    Row {error.row}: {error.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </form>
      </CardBody>
    </Card>
  );
};

export default PlannerPage;
