"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DatasetUpload } from "@/components/dataset-upload";
import { useDatasetsQuery } from "@/lib/hooks/use-datasets";

export default function DatasetsPage() {
  const { data, isPending, isError, refetch } = useDatasetsQuery();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Datasets</h1>
        <p className="text-sm text-muted-foreground">
          Upload customer data to profile it, check its quality, and explore it before training.
        </p>
      </div>

      <DatasetUpload />

      <div className="space-y-3">
        <h2 className="font-heading text-lg font-medium">Uploaded datasets</h2>

        {isPending && (
          <div className="space-y-2" aria-busy="true" aria-label="Loading datasets">
            <div className="h-16 w-full animate-pulse rounded-lg bg-muted" />
            <div className="h-16 w-full animate-pulse rounded-lg bg-muted" />
          </div>
        )}

        {isError && (
          <Card>
            <CardContent className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Couldn&apos;t load datasets.</p>
              <button
                onClick={() => void refetch()}
                className="text-sm font-medium text-primary hover:underline"
              >
                Retry
              </button>
            </CardContent>
          </Card>
        )}

        {data && data.items.length === 0 && (
          <Card>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                No datasets yet — upload a CSV or load the sample dataset above to get started.
              </p>
            </CardContent>
          </Card>
        )}

        {data && data.items.length > 0 && (
          <div className="space-y-2">
            {data.items.map((dataset) => (
              <Link key={dataset.id} href={`/datasets/${dataset.id}`}>
                <Card className="transition-colors hover:bg-muted/50">
                  <CardContent className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{dataset.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {dataset.n_rows.toLocaleString()} rows · {dataset.n_cols} columns
                      </p>
                    </div>
                    <Badge variant="secondary">{dataset.column_profile.target_column}</Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
