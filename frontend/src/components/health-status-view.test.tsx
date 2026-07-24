import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { HealthStatusView } from "@/components/health-status-view";

describe("HealthStatusView", () => {
  it("shows a busy indicator while loading", () => {
    render(<HealthStatusView state={{ status: "loading" }} />);
    expect(screen.getByLabelText("Loading backend status")).toBeInTheDocument();
  });

  it("renders version and db status on success", () => {
    render(<HealthStatusView state={{ status: "success", version: "1.2.3", db: "ok" }} />);
    expect(screen.getByText("1.2.3")).toBeInTheDocument();
    expect(screen.getByText("online")).toBeInTheDocument();
    expect(screen.getByText("ok")).toBeInTheDocument();
  });

  it("calls onRetry when the retry button is clicked", async () => {
    const onRetry = vi.fn();
    render(<HealthStatusView state={{ status: "error", onRetry }} />);

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(onRetry).toHaveBeenCalledOnce();
  });
});
