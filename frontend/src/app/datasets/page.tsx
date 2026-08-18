"use client";

import Link from "next/link";

import { DatasetUpload } from "@/components/dataset-upload";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useDatasetsQuery } from "@/lib/hooks/use-datasets";

export default function DatasetsPage() {
  const { data, isPending, isError, error, refetch } = useDatasetsQuery();

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

        {isPending && <LoadingRows rows={2} label="Loading datasets" />}

        {isError && (
          <ErrorState
            error={error}
            fallback="Couldn't load your datasets. Check that the API is running."
            onRetry={() => void refetch()}
          />
        )}

        {data && data.items.length === 0 && (
          <EmptyState
            title="No datasets yet"
            body="Upload a CSV of customers, or load the sample dataset above, and it will be profiled and quality-checked ready for training."
          />
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
