"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLoadSampleDataset, useUploadDataset } from "@/lib/hooks/use-datasets";
import { cn } from "@/lib/utils";

export function DatasetUpload() {
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useUploadDataset();
  const loadSample = useLoadSampleDataset();

  const busy = upload.isPending || loadSample.isPending;

  function handleFile(file: File) {
    upload.mutate(file, {
      onSuccess: (dataset) => router.push(`/datasets/${dataset.id}`),
    });
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleLoadSample() {
    loadSample.mutate(undefined, {
      onSuccess: (dataset) => router.push(`/datasets/${dataset.id}`),
    });
  }

  const error = upload.error ?? loadSample.error;

  return (
    <Card>
      <CardContent className="space-y-4">
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload a CSV dataset"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-6 py-12 text-center transition-colors",
            isDragging && "border-primary bg-muted/50",
            busy && "pointer-events-none opacity-60",
          )}
        >
          <p className="text-sm font-medium">Drag and drop a CSV, or click to browse</p>
          <p className="text-xs text-muted-foreground">Up to 50MB. One file at a time.</p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
        </div>

        {upload.isPending && (
          <div className="space-y-1" aria-busy="true" aria-label="Uploading dataset">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${upload.progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">Uploading… {upload.progress}%</p>
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            No data handy? Try the bundled Telco churn dataset.
          </p>
          <Button variant="outline" size="sm" onClick={handleLoadSample} disabled={busy}>
            {loadSample.isPending ? "Loading…" : "Load sample dataset"}
          </Button>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Something went wrong."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
