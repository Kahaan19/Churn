import type { Dataset, EDAPayload } from "@/lib/api/datasets";

type ColumnProfile = Dataset["column_profile"];

export type FeatureField =
  | { column: string; kind: "numeric"; value: number }
  | { column: string; kind: "categorical"; value: string; levels: string[] };

/**
 * Builds the explain form's fields from the run's column profile, prefilled with a plausible
 * customer taken from the dataset's own EDA aggregates — modal category, modal histogram bin.
 *
 * EDA is already binned server-side, so this never needs a raw data row to produce a sensible
 * starting point for "explain someone like this".
 */
export function buildFeatureFields(profile: ColumnProfile, eda: EDAPayload): FeatureField[] {
  const histograms = new Map(eda.histograms.map((h) => [h.column, h]));
  const categoricals = new Map(eda.categorical.map((c) => [c.column, c]));

  const numericFields: FeatureField[] = profile.numeric.map((column) => ({
    column,
    kind: "numeric",
    value: modalBinCenter(histograms.get(column)),
  }));

  const categoricalFields: FeatureField[] = [
    ...profile.categorical_low,
    ...profile.categorical_high,
  ].map((column) => {
    // value_counts orders levels by frequency, so the first is the most common customer.
    const levels = categoricals.get(column)?.levels ?? [];
    return { column, kind: "categorical", value: levels[0] ?? "", levels };
  });

  return [...numericFields, ...categoricalFields];
}

function modalBinCenter(histogram: EDAPayload["histograms"][number] | undefined): number {
  if (!histogram || histogram.counts.length === 0) return 0;
  let peak = 0;
  for (let i = 1; i < histogram.counts.length; i += 1) {
    if (histogram.counts[i] > histogram.counts[peak]) peak = i;
  }
  const center = (histogram.bins[peak] + histogram.bins[peak + 1]) / 2;
  return Number(center.toFixed(2));
}

export function fieldsToFeatures(fields: FeatureField[]): Record<string, string | number> {
  return Object.fromEntries(fields.map((field) => [field.column, field.value]));
}
