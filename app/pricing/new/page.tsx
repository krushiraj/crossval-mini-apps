"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Button, Card, CardBody, CardHeader, Field, Input } from "@/components/ui";
import { ApiError, api } from "@/lib/api-client";
import { todayIsoDate } from "@/lib/dates";

import type { PricingDocument } from "../_types";

const NewPricingDocumentPage = () => {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [customer, setCustomer] = React.useState("");
  const [issueDate, setIssueDate] = React.useState(todayIsoDate());
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: () => api.post<PricingDocument>("/api/pricing/documents", { title, customer, issueDate }),
    onSuccess: (document) => {
      toast.success("Document created.");
      router.push(`/pricing/${document.id}`);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fieldErrors) {
        setFieldErrors(error.fieldErrors);
      } else {
        toast.error(error instanceof ApiError ? error.message : "Could not create the document.");
      }
    },
  });

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="New document" description="Add line items once the document is created." />

      <Card>
        <CardHeader title="Details" />
        <CardBody>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              setFieldErrors({});
              mutation.mutate();
            }}
          >
            <Field label="Title" error={fieldErrors.title}>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} required />
            </Field>
            <Field label="Customer" error={fieldErrors.customer}>
              <Input value={customer} onChange={(event) => setCustomer(event.target.value)} required />
            </Field>
            <Field label="Issue date" error={fieldErrors.issueDate}>
              <Input
                type="date"
                value={issueDate}
                onChange={(event) => setIssueDate(event.target.value)}
                required
              />
            </Field>
            <div className="mt-2 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => router.push("/pricing")}>
                Cancel
              </Button>
              <Button type="submit" loading={mutation.isPending}>
                Create document
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
};

export default NewPricingDocumentPage;
