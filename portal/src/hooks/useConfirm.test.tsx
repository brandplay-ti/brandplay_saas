import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfirmProvider, useConfirm, type ConfirmOptions } from "./useConfirm";

let resultado: boolean | undefined;

const Gatilho = ({ options }: { options: ConfirmOptions }) => {
  const confirm = useConfirm();
  return (
    <button
      onClick={async () => {
        resultado = await confirm(options);
      }}
    >
      abrir
    </button>
  );
};

const montar = (options: ConfirmOptions) => {
  resultado = undefined;
  render(
    <ConfirmProvider>
      <Gatilho options={options} />
    </ConfirmProvider>,
  );
  fireEvent.click(screen.getByText("abrir"));
};

describe("useConfirm", () => {
  it("mostra título, descrição e os rótulos dos botões", async () => {
    montar({ title: "Excluir este ativo?", description: "Remove fotos e alocações.", confirmLabel: "Excluir" });
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("Excluir este ativo?")).toBeInTheDocument();
    expect(screen.getByText("Remove fotos e alocações.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excluir" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
  });

  it("resolve true ao confirmar", async () => {
    montar({ title: "Remover?", confirmLabel: "Remover" });
    fireEvent.click(await screen.findByRole("button", { name: "Remover" }));
    await waitFor(() => expect(resultado).toBe(true));
  });

  it("resolve false ao cancelar", async () => {
    montar({ title: "Remover?", confirmLabel: "Remover" });
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(resultado).toBe(false));
  });

  it("resolve false ao fechar com Esc", async () => {
    montar({ title: "Remover?" });
    const dialogo = await screen.findByRole("alertdialog");
    act(() => {
      fireEvent.keyDown(dialogo, { key: "Escape" });
    });
    await waitFor(() => expect(resultado).toBe(false));
  });

  it("exige o provider", () => {
    const Solto = () => {
      useConfirm();
      return null;
    };
    // O React registra o erro de render no console antes de repassá-lo.
    const silenciar = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Solto />)).toThrow(/ConfirmProvider/);
    silenciar.mockRestore();
  });
});
