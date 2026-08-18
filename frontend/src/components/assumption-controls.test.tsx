import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AssumptionControls } from "@/components/assumption-controls";

const CONFIGURED = { saveRate: 0.3, grossMargin: 0.65 };

describe("AssumptionControls", () => {
  it("shows the configured values until something is overridden", () => {
    render(<AssumptionControls configured={CONFIGURED} overrides={{}} onChange={vi.fn()} />);

    expect(screen.getByLabelText("Customers saved when contacted")).toHaveValue("0.3");
    expect(screen.getByLabelText("Gross margin")).toHaveValue("0.65");
    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
  });

  it("reports a moved slider as a number, so the query parameter is not a string", () => {
    const onChange = vi.fn();
    render(<AssumptionControls configured={CONFIGURED} overrides={{}} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Customers saved when contacted"), {
      target: { value: "0.5" },
    });

    expect(onChange).toHaveBeenCalledWith({ saveRate: 0.5 });
  });

  it("keeps the other override when only one slider moves", () => {
    const onChange = vi.fn();
    render(
      <AssumptionControls
        configured={CONFIGURED}
        overrides={{ saveRate: 0.5 }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Gross margin"), { target: { value: "0.4" } });

    expect(onChange).toHaveBeenCalledWith({ saveRate: 0.5, grossMargin: 0.4 });
  });

  it("says the figures are a what-if once a value differs from config", () => {
    render(
      <AssumptionControls
        configured={CONFIGURED}
        overrides={{ saveRate: 0.1 }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/this is a what-if/)).toBeInTheDocument();
    expect(screen.getByText(/30% saved, 65% margin/)).toBeInTheDocument();
  });

  it("clears every override at once when reset", async () => {
    const onChange = vi.fn();
    render(
      <AssumptionControls
        configured={CONFIGURED}
        overrides={{ saveRate: 0.1, grossMargin: 0.9 }}
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(onChange).toHaveBeenCalledWith({});
  });
});
