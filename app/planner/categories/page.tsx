"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { ApiError } from "@/lib/api-client";
import { Button, Card, CardBody, CardHeader, EmptyState, Field, Input, LoadingRow, Table, Td, Th } from "@/components/ui";
import { PageHeader } from "@/components/app-shell";
import type { Category } from "@/app/planner/_api";
import { plannerApi, plannerKeys } from "@/app/planner/_api";

const CategoriesPage = () => {
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery({
    queryKey: plannerKeys.categories,
    queryFn: () => plannerApi.listCategories(),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: plannerKeys.categories });
  };

  const categories = categoriesQuery.data?.categories ?? [];

  return (
    <div>
      <PageHeader
        title="Categories"
        description="Spending categories used to tag plans and actuals, e.g. Marketing, Payroll, Tools."
      />

      <div className="flex flex-col gap-6">
        <CreateCategoryForm onCreated={invalidate} />

        <Card>
          <CardHeader title="All categories" />
          {categoriesQuery.isLoading ? (
            <LoadingRow />
          ) : categories.length === 0 ? (
            <EmptyState title="No categories yet" description="Create your first category above." />
          ) : (
            <Table className="min-w-[28rem]">
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th className="w-24 text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <CategoryRow key={category.id} category={category} onChanged={invalidate} />
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
};

const CreateCategoryForm = ({ onCreated }: { onCreated: () => void }) => {
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | undefined>();

  const mutation = useMutation({
    mutationFn: () => plannerApi.createCategory(name.trim()),
    onSuccess: () => {
      toast.success(`Category "${name.trim()}" created.`);
      setName("");
      setError(undefined);
      onCreated();
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError && (err.fieldErrors?.name || err.code === "DUPLICATE_CATEGORY_NAME")) {
        setError(err.fieldErrors?.name ?? err.message);
        return;
      }
      toast.error(err instanceof Error ? err.message : "Could not create the category.");
    },
  });

  return (
    <Card>
      <CardHeader title="New category" />
      <CardBody>
        <form
          className="flex items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) {
              setError("Category name is required.");
              return;
            }
            mutation.mutate();
          }}
        >
          <Field label="Name" error={error} className="max-w-xs">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Marketing" />
          </Field>
          <Button type="submit" loading={mutation.isPending}>
            <Plus className="h-3.5 w-3.5" /> Add category
          </Button>
        </form>
      </CardBody>
    </Card>
  );
};

const CategoryRow = ({ category, onChanged }: { category: Category; onChanged: () => void }) => {
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(category.name);
  const [error, setError] = React.useState<string | undefined>();

  const updateMutation = useMutation({
    mutationFn: () => plannerApi.updateCategory(category.id, name.trim()),
    onSuccess: () => {
      toast.success("Category renamed.");
      setEditing(false);
      setError(undefined);
      onChanged();
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError && (err.fieldErrors?.name || err.code === "DUPLICATE_CATEGORY_NAME")) {
        setError(err.fieldErrors?.name ?? err.message);
        return;
      }
      toast.error(err instanceof Error ? err.message : "Could not rename the category.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => plannerApi.deleteCategory(category.id),
    onSuccess: () => {
      toast.success(`Category "${category.name}" deleted.`);
      onChanged();
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Could not delete the category."),
  });

  const submitRename = () => {
    if (!name.trim()) {
      setError("Category name is required.");
      return;
    }
    updateMutation.mutate();
  };

  const cancelEdit = () => {
    setEditing(false);
    setName(category.name);
    setError(undefined);
  };

  if (editing) {
    return (
      <tr>
        <Td>
          {/* Separate <td>s mean one <form> can't wrap both, so Enter/Escape
              are handled here directly (same pattern as the plan-target inputs). */}
          <Field error={error} className="max-w-xs">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitRename();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  cancelEdit();
                }
              }}
              autoFocus
            />
          </Field>
        </Td>
        <Td className="text-right">
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={cancelEdit} aria-label="Cancel">
              <X className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" loading={updateMutation.isPending} onClick={submitRename}>
              Save
            </Button>
          </div>
        </Td>
      </tr>
    );
  }

  return (
    <tr>
      <Td className="font-medium text-slate-900">{category.name}</Td>
      <Td className="text-right">
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label="Rename">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (confirm(`Delete "${category.name}"? This also removes its plans and actuals.`)) {
                deleteMutation.mutate();
              }
            }}
            loading={deleteMutation.isPending}
            aria-label="Delete"
          >
            <Trash2 className="h-3.5 w-3.5 text-red-600" />
          </Button>
        </div>
      </Td>
    </tr>
  );
};

export default CategoriesPage;
