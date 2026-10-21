import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoadingSkeleton } from "./LoadingSkeleton";

describe("LoadingSkeleton", () => {
  it.each(["lista", "cards", "detalhe", "quadro"] as const)("anuncia o carregamento (%s)", (variant) => {
    render(<LoadingSkeleton variant={variant} />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent("Carregando…");
  });

  it("respeita a quantidade pedida", () => {
    const { container } = render(<LoadingSkeleton variant="lista" count={3} />);
    expect(container.querySelectorAll(".rounded-md.border")).toHaveLength(3);
  });
});
