import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ModelComparisonTable } from "@/components/model-comparison-table";
import type { Run } from "@/lib/api/runs";

type ModelArtifact = Run["models"][number];

function makeModel(overrides: Partial<ModelArtifact> & { algorithm: string }): ModelArtifact {
  return {
    id: overrides.algorithm,
    params: {},
    is_best: false,
    created_at: "2026-08-08T00:00:00Z",
    metrics: {
      validation: {
        accuracy: 0.75,
        precision: 0.6,
        recall: 0.5,
        f1: 0.55,
        roc_auc: 0.8,
        pr_auc: 0.6,
        brier: 0.15,
        confusion_matrix: [
          [1, 2],
          [3, 4],
        ],
        split: "validation",
      },
      test: null,
    },
    ...overrides,
  };
}

describe("ModelComparisonTable", () => {
  it("marks the winning model and PR-AUC as the selection criterion", () => {
    const models = [
      makeModel({ algorithm: "logistic_regression", is_best: true }),
      makeModel({ algorithm: "random_forest" }),
    ];

    render(<ModelComparisonTable models={models} />);

    expect(screen.getByText("winner")).toBeInTheDocument();
    expect(screen.getByTitle("Model selection criterion (validation PR-AUC)")).toBeInTheDocument();
  });

  it("sorts by PR-AUC descending by default", () => {
    const models = [
      makeModel({
        algorithm: "low_pr_auc",
        metrics: {
          validation: {
            accuracy: 0.7,
            precision: 0.5,
            recall: 0.4,
            f1: 0.45,
            roc_auc: 0.7,
            pr_auc: 0.3,
            brier: 0.2,
            confusion_matrix: [
              [1, 1],
              [1, 1],
            ],
            split: "validation",
          },
          test: null,
        },
      }),
      makeModel({ algorithm: "high_pr_auc" }),
    ];

    render(<ModelComparisonTable models={models} />);

    const rows = screen.getAllByRole("row").slice(1); // drop header row
    expect(rows[0]).toHaveTextContent("high pr auc");
    expect(rows[1]).toHaveTextContent("low pr auc");
  });

  it("re-sorts ascending when the already-sorted column header is clicked", async () => {
    const models = [
      makeModel({
        algorithm: "low_pr_auc",
        metrics: {
          validation: {
            accuracy: 0.7,
            precision: 0.5,
            recall: 0.4,
            f1: 0.45,
            roc_auc: 0.7,
            pr_auc: 0.3,
            brier: 0.2,
            confusion_matrix: [
              [1, 1],
              [1, 1],
            ],
            split: "validation",
          },
          test: null,
        },
      }),
      makeModel({ algorithm: "high_pr_auc" }),
    ];

    render(<ModelComparisonTable models={models} />);
    const prAucHeader = screen.getByTitle("Model selection criterion (validation PR-AUC)");

    // Default sort is already PR-AUC descending; one click on the same column reverses it.
    await userEvent.click(prAucHeader);

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("low pr auc");
    expect(rows[1]).toHaveTextContent("high pr auc");
  });
});
