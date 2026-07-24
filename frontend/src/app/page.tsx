import { HealthStatus } from "@/components/health-status";

export default function OverviewPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Foundation is live. Upload a dataset and train a model to populate this dashboard.
        </p>
      </div>
      <HealthStatus />
    </div>
  );
}
