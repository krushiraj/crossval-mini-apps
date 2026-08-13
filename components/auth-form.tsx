"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { signIn, signUp } from "@/lib/auth-client";
import { Button, Card, CardBody, Field, Input } from "@/components/ui";

type Mode = "login" | "signup";

export const AuthForm = ({ mode, next }: { mode: Mode; next: string }) => {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);

  const validateLocally = (): boolean => {
    const errors: Record<string, string> = {};
    if (mode === "signup" && name.trim().length < 2) {
      errors.name = "Please enter your name.";
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      errors.email = "Enter a valid email address.";
    }
    if (password.length < 8) {
      errors.password = "Password must be at least 8 characters.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateLocally()) return;

    setSubmitting(true);
    const result =
      mode === "signup"
        ? await signUp.email({ name: name.trim(), email: email.trim(), password })
        : await signIn.email({ email: email.trim(), password });

    if (result.error) {
      setSubmitting(false);
      toast.error(
        result.error.message ??
          (mode === "signup" ? "Could not create your account." : "Could not sign you in."),
      );
      return;
    }

    toast.success(mode === "signup" ? "Account created." : "Welcome back.");
    router.push(next);
    router.refresh();
  };

  return (
    <Card className="w-full max-w-sm">
      <CardBody className="space-y-4">
        <div>
          <h1 className="text-base font-semibold text-slate-900">
            {mode === "signup" ? "Create an account" : "Sign in"}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            One account gives you access to all three apps.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          {mode === "signup" ? (
            <Field label="Name" error={fieldErrors.name}>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ada Lovelace"
                autoComplete="name"
              />
            </Field>
          ) : null}

          <Field label="Email" error={fieldErrors.email}>
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </Field>

          <Field
            label="Password"
            error={fieldErrors.password}
            hint={mode === "signup" ? "At least 8 characters." : undefined}
          >
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </Field>

          <Button type="submit" className="w-full" loading={submitting}>
            {mode === "signup" ? "Create account" : "Sign in"}
          </Button>
        </form>

        <p className="text-center text-xs text-slate-500">
          {mode === "signup" ? (
            <>
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-slate-900 underline">
                Sign in
              </Link>
            </>
          ) : (
            <>
              New here?{" "}
              <Link href="/signup" className="font-medium text-slate-900 underline">
                Create an account
              </Link>
            </>
          )}
        </p>
      </CardBody>
    </Card>
  );
};
