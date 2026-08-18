import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SetupStep = "dataset" | "run" | "scoring";

const STEPS: { key: SetupStep; title: string; body: string; href: string; cta: string }[] = [
  {
    key: "dataset",
    title: "Add your customer data",
    body: "A CSV with one row per customer, their monthly charge, and whether they left. There is a sample dataset if you just want to see how this works.",
    href: "/datasets",
    cta: "Upload a dataset",
  },
  {
    key: "run",
    title: "Train a model on it",
    body: "Four algorithms are fitted and compared, and the best one is calibrated so its probabilities can be trusted with money. It takes a few minutes.",
    href: "/runs",
    cta: "Train a model",
  },
  {
    key: "scoring",
    title: "Score your customers",
    body: "Upload the customers you want ranked — or try a single one — and every figure on this page fills in.",
    href: "/predict",
    cta: "Score customers",
  },
];

/**
 * The empty database is the first thing a stranger sees, so it has to say what to do next rather
 * than apologise for having no data (CONVENTIONS.md: "Empty states say what to do next").
 *
 * All three steps are always shown, with the current one live: knowing there are three, and which
 * one you are on, is most of what makes an unfamiliar tool feel finishable.
 */
export function GettingStarted({ current }: { current: SetupStep }) {
  const currentIndex = STEPS.findIndex((step) => step.key === current);

  return (
    <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10 sm:p-8">
      <h2 className="font-heading text-xl font-semibold tracking-tight">
        Three steps to a scored customer
      </h2>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">
        Nothing has been scored yet, so there is no revenue at risk to report.
      </p>

      <ol className="mt-6 space-y-4">
        {STEPS.map((step, index) => {
          const isDone = index < currentIndex;
          const isCurrent = index === currentIndex;

          return (
            <li
              key={step.key}
              className={cn(
                "flex gap-4 rounded-lg p-4",
                isCurrent ? "bg-accent/60 ring-1 ring-primary/25" : "opacity-60",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                  isCurrent
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {isDone ? "✓" : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {step.title}
                  {isDone && <span className="sr-only"> — done</span>}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">{step.body}</p>
                {isCurrent && (
                  <Button
                    size="sm"
                    className="mt-3"
                    render={<Link href={step.href}>{step.cta}</Link>}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
