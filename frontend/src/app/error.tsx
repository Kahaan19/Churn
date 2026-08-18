"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/states";

/**
 * The last line of defence: a render that throws would otherwise show Next's own error screen,
 * which tells a retention manager nothing and offers them nothing to do.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Nothing collects client errors yet, so the console is where this has to go for now.
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      title="This page hit an error"
      error={error}
      fallback="Something went wrong rendering this page. Retrying often clears it; if it doesn't, check that the API is running."
      onRetry={reset}
    />
  );
}
