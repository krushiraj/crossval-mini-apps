"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { SignOutButton } from "@/components/sign-out-button";
import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
}

export const AppShell = ({
  appName,
  appHref,
  nav,
  userEmail,
  children,
}: {
  appName: string;
  appHref: string;
  nav: NavItem[];
  userEmail: string;
  children: React.ReactNode;
}) => {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-14 max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:flex-nowrap sm:gap-4 sm:py-0">
          <Link href="/" className="text-sm font-semibold text-slate-900">
            CrossVal
          </Link>
          <span className="text-slate-300">/</span>
          <Link href={appHref} className="text-sm font-medium text-slate-700 hover:text-slate-900">
            {appName}
          </Link>

          <nav className="flex items-center gap-1 sm:ml-6">
            {nav.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-sm transition-colors sm:px-3",
                    active
                      ? "bg-slate-100 font-medium text-slate-900"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-slate-500 sm:inline">{userEmail}</span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
};

export const PageHeader = ({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) => {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        {description ? <p className="mt-0.5 text-sm text-slate-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
};
