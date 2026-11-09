import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Boxes } from "lucide-react";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("mostra título, explicação e a próxima ação", () => {
    const criar = vi.fn();
    render(
      <EmptyState
        icon={Boxes}
        title="Nenhum ativo cadastrado"
        description="Cadastre um ou importe uma planilha."
        action={<button onClick={criar}>Novo ativo</button>}
      />,
    );
    expect(screen.getByRole("heading", { name: "Nenhum ativo cadastrado" })).toBeInTheDocument();
    expect(screen.getByText("Cadastre um ou importe uma planilha.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Novo ativo" }));
    expect(criar).toHaveBeenCalledTimes(1);
  });

  it("sem ação, não renderiza a área do botão", () => {
    render(<EmptyState title="Nenhuma notificação" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("o ícone é decorativo e a borda some dentro de um card", () => {
    const { container } = render(<EmptyState icon={Boxes} title="Nenhum ativo" bordered={false} />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden");
    expect(container.firstElementChild).not.toHaveClass("border-dashed");
  });
});
