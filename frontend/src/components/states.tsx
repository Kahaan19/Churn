"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The three states every data-driven view owes the reader (CONVENTIONS.md).
 *
 * Shared rather than re-typed per page so that "couldn't load" looks and reads the same in every
 * corner of the app, and so no view can quietly ship with only the success case.
 */

export function LoadingRows({
  rows = 3,
  className,
  label = "Loading",
}: {
  rows?: number;
  className?: string;
  label?: string;
}) {
  return (
    <div className={cn("space-y-2", className)} aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-16 w-full animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}

/**
 * `error` is rendered verbatim when it carries a message: the API's envelopes name the offending
 * column, row, or limit, and replacing that with "something went wrong" throws away the only part
 * a user can act on.
 */
export function ErrorState({
  title = "That didn't load",
  error,
  fallback,
  onRetry,
  children,
}: {
  title?: string;
  error?: unknown;
  /** Shown when the failure carries no message of its own. Say what to check. */
  fallback: string;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  const message = error instanceof Error && error.message ? error.message : fallback;

  return (
    <div role="alert" className="space-y-3 rounded-lg bg-card p-6 ring-1 ring-foreground/10">
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-prose text-sm text-muted-foreground">{message}</p>
      <div className="flex flex-wrap gap-2">
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        )}
        {children}
      </div>
    </div>
  );
}

/** Empty states say what to do next, never just that there is nothing here. */
export function EmptyState({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-lg bg-card p-10 text-center ring-1 ring-foreground/10">
      <p className="text-sm font-medium">{title}</p>
      <p className="mx-auto max-w-prose text-sm text-muted-foreground">{body}</p>
      {children && <div className="flex justify-center gap-2 pt-1">{children}</div>}
    </div>
  );
}
