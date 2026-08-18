import { FinancialsPanel } from "@/components/financials-panel";
import { WaterfallChart } from "@/components/waterfall-chart";
import type { Prediction } from "@/lib/api/predictions";
import { topCaptions } from "@/lib/explanation";

/**
 * One customer, end to end: why they are at risk, and what it costs.
 *
 * Shared by the drawer over the ranked list and the `/customers/[id]` permalink, so the two can
 * never drift into telling the same person two different stories.
 */
export function CustomerDetail({ prediction }: { prediction: Prediction }) {
  return (
    <>
      <section className="space-y-2">
        <h2 className="font-heading text-sm font-medium">Why they&apos;re at risk</h2>
        <ul className="space-y-1 text-sm text-muted-foreground">
          {topCaptions(prediction.shap_values.values).map((caption) => (
            <li key={caption}>{caption}</li>
          ))}
        </ul>
        <div className="h-80">
          <WaterfallChart
            explanation={{
              base_value: prediction.shap_values.base_value,
              output_space: prediction.shap_values.output_space,
              shap_values: prediction.shap_values.values,
            }}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-sm font-medium">What they&apos;re worth</h2>
        <FinancialsPanel financials={prediction.financials} />
      </section>
    </>
  );
}
