import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { ApiError } from "@/lib/api/client";

describe("ErrorState", () => {
  it("shows the API's own message, which names what the user has to fix", () => {
    render(
      <ErrorState
        error={new ApiError("Missing required column(s): Contract.", 422)}
        fallback="Couldn't score that file."
      />,
    );

    expect(screen.getByText("Missing required column(s): Contract.")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't score that file.")).not.toBeInTheDocument();
  });

  it("falls back to advice when the failure carries no message", () => {
    render(<ErrorState error={undefined} fallback="Check that the API is running." />);

    expect(screen.getByText("Check that the API is running.")).toBeInTheDocument();
  });

  it("announces itself so a screen reader hears the failure without hunting for it", () => {
    render(<ErrorState fallback="Check that the API is running." />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("offers a retry only when there is something to retry", async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<ErrorState fallback="Nope." />);
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();

    rerender(<ErrorState fallback="Nope." onRetry={onRetry} />);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe("EmptyState", () => {
  it("says what to do next rather than only that there is nothing here", () => {
    render(<EmptyState title="No runs yet" body="Train one above to see model performance." />);

    expect(screen.getByText("No runs yet")).toBeInTheDocument();
    expect(screen.getByText("Train one above to see model performance.")).toBeInTheDocument();
  });
});

describe("LoadingRows", () => {
  it("marks itself busy and labelled, so the wait is announced rather than silent", () => {
    render(<LoadingRows rows={4} label="Loading runs" />);

    const skeleton = screen.getByLabelText("Loading runs");
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    expect(skeleton.children).toHaveLength(4);
  });
});
