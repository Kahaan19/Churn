import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type HealthState =
  | { status: "loading" }
  | { status: "error"; onRetry: () => void }
  | { status: "success"; version: string; db: "ok" | "error" };

export function HealthStatusView({ state }: { state: HealthState }) {
  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Backend status</CardTitle>
        <CardDescription>Live health of the CRIP API and its database.</CardDescription>
      </CardHeader>
      <CardContent>
        {state.status === "loading" && (
          <div className="space-y-2" aria-busy="true" aria-label="Loading backend status">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
          </div>
        )}

        {state.status === "error" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t reach the backend. Check that the API is running.
            </p>
            <Button variant="outline" size="sm" onClick={state.onRetry}>
              Retry
            </Button>
          </div>
        )}

        {state.status === "success" && (
          <dl className="grid grid-cols-2 gap-y-3 text-sm">
            <dt className="text-muted-foreground">API</dt>
            <dd>
              <Badge variant="secondary">online</Badge>
            </dd>
            <dt className="text-muted-foreground">Database</dt>
            <dd>
              <Badge variant={state.db === "ok" ? "secondary" : "destructive"}>{state.db}</Badge>
            </dd>
            <dt className="text-muted-foreground">Version</dt>
            <dd className="font-mono tabular-nums">{state.version}</dd>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
