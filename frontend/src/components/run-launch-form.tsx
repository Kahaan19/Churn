"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDatasetsQuery } from "@/lib/hooks/use-datasets";
import { useCreateRun } from "@/lib/hooks/use-runs";

const ALGORITHM_OPTIONS = [
  { value: "logistic_regression", label: "Logistic Regression" },
  { value: "random_forest", label: "Random Forest" },
  { value: "xgboost", label: "XGBoost" },
  { value: "lightgbm", label: "LightGBM" },
];

export function RunLaunchForm() {
  const router = useRouter();
  const datasets = useDatasetsQuery();
  const createRun = useCreateRun();

  const [datasetId, setDatasetId] = useState("");
  const [algorithms, setAlgorithms] = useState<string[]>(ALGORITHM_OPTIONS.map((a) => a.value));
  const [tune, setTune] = useState(false);

  function toggleAlgorithm(value: string) {
    setAlgorithms((current) =>
      current.includes(value) ? current.filter((a) => a !== value) : [...current, value],
    );
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!datasetId || algorithms.length === 0) return;
    createRun.mutate(
      { dataset_id: datasetId, algorithms, tune },
      { onSuccess: (run) => router.push(`/runs/${run.id}`) },
    );
  }

  const datasetOptions = datasets.data?.items ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Train a model</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="dataset" className="text-sm font-medium">
              Dataset
            </label>
            <select
              id="dataset"
              value={datasetId}
              onChange={(e) => setDatasetId(e.target.value)}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <option value="" disabled>
                {datasetOptions.length === 0 ? "No datasets yet" : "Select a dataset…"}
              </option>
              {datasetOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.n_rows.toLocaleString()} rows)
                </option>
              ))}
            </select>
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Algorithms</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {ALGORITHM_OPTIONS.map((option) => (
                <label key={option.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={algorithms.includes(option.value)}
                    onChange={() => toggleAlgorithm(option.value)}
                    className="h-4 w-4 rounded border-input"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={tune}
              onChange={(e) => setTune(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Tune hyperparameters (slower — RandomizedSearchCV on the top two models)
          </label>

          {createRun.error && (
            <p role="alert" className="text-sm text-destructive">
              {createRun.error instanceof Error
                ? createRun.error.message
                : "Something went wrong."}
            </p>
          )}

          <Button
            type="submit"
            disabled={!datasetId || algorithms.length === 0 || createRun.isPending}
          >
            {createRun.isPending ? "Starting…" : "Start training run"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
