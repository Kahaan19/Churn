"use client";

import { Button } from "@/components/ui/button";
import { formatPercent } from "@/lib/format";

export interface AssumptionOverrides {
  saveRate?: number;
  grossMargin?: number;
}

interface AssumptionControlsProps {
  /** What `config/financial.yaml` says — the value each control returns to when reset. */
  configured: { saveRate: number; grossMargin: number };
  overrides: AssumptionOverrides;
  onChange: (next: AssumptionOverrides) => void;
}

/**
 * The two assumptions a retention team argues about, as live inputs rather than fixed constants.
 *
 * `save_rate` especially is a guess, not a measurement, and every recoverable-revenue figure is
 * linear in it. Letting someone drag it to 10% and watch the business case move is more honest
 * than printing one number and hoping they read the footnote (ARCHITECTURE.md, "Financial model").
 */
export function AssumptionControls({ configured, overrides, onChange }: AssumptionControlsProps) {
  const saveRate = overrides.saveRate ?? configured.saveRate;
  const grossMargin = overrides.grossMargin ?? configured.grossMargin;
  const isOverridden = overrides.saveRate !== undefined || overrides.grossMargin !== undefined;

  return (
    <div className="rounded-lg bg-muted/50 p-4 ring-1 ring-foreground/5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">Assumptions</p>
        {isOverridden && (
          <Button variant="ghost" size="sm" onClick={() => onChange({})}>
            Reset
          </Button>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Every figure on this page moves with these. They are estimates, not measurements.
      </p>

      <div className="mt-4 space-y-4">
        <Slider
          id="save-rate"
          label="Customers saved when contacted"
          note="How often a retention offer actually works."
          value={saveRate}
          min={0}
          max={1}
          step={0.05}
          onChange={(value) => onChange({ ...overrides, saveRate: value })}
        />
        <Slider
          id="gross-margin"
          label="Gross margin"
          note="The share of revenue that is profit, which is what lifetime value counts."
          value={grossMargin}
          min={0.05}
          max={1}
          step={0.05}
          onChange={(value) => onChange({ ...overrides, grossMargin: value })}
        />
      </div>

      {isOverridden && (
        <p className="mt-4 text-xs text-muted-foreground">
          These differ from the configured defaults ({formatPercent(configured.saveRate)} saved,{" "}
          {formatPercent(configured.grossMargin)} margin). Nothing is saved — this is a what-if.
        </p>
      )}
    </div>
  );
}

interface SliderProps {
  id: string;
  label: string;
  note: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

function Slider({ id, label, note, value, min, max, step, onChange }: SliderProps) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-xs font-medium">
          {label}
        </label>
        <span className="font-heading text-sm font-semibold tabular-nums">
          {formatPercent(value)}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={formatPercent(value)}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1.5 w-full accent-primary"
      />
      <p className="text-[0.68rem] text-muted-foreground">{note}</p>
    </div>
  );
}
