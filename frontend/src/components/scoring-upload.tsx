"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent } from "react";

import { useUploadScoringCsv } from "@/lib/hooks/use-predictions";
import { cn } from "@/lib/utils";

interface ScoringUploadProps {
  runId: string;
  requiredColumns: string[];
}

/**
 * Upload a customer file and score every row against the chosen run.
 *
 * The required columns are listed before the drop zone, not after a rejection: the backend's 422
 * names what's missing, but a user shouldn't have to fail once to find out what the file needs.
 */
export function ScoringUpload({ runId, requiredColumns }: ScoringUploadProps) {
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadScoringCsv(runId);

  function handleFile(file: File) {
    upload.mutate(file, {
      onSuccess: (batch) => router.push(`/predict/batches/${batch.id}`),
    });
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload a CSV of customers to score"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => event.key === "Enter" && inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-6 py-10 text-center transition-colors",
          isDragging && "border-primary bg-muted/50",
          upload.isPending && "pointer-events-none opacity-60",
        )}
      >
        <p className="text-sm font-medium">
          {upload.isPending ? "Checking your file…" : "Drop a customer CSV, or click to browse"}
        </p>
        <p className="text-xs text-muted-foreground">
          One row per customer. The churn column isn&apos;t needed — that&apos;s what this predicts.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) handleFile(file);
            event.target.value = "";
          }}
        />
      </div>

      {upload.error && (
        <p role="alert" className="text-sm text-destructive">
          {upload.error instanceof Error ? upload.error.message : "That file couldn't be scored."}
        </p>
      )}

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">
          Columns this file needs ({requiredColumns.length})
        </summary>
        <p className="mt-2 font-mono leading-relaxed">{requiredColumns.join(", ")}</p>
      </details>
    </div>
  );
}
