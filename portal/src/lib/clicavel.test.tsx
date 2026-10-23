import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { clicavel } from "./clicavel";

describe("clicavel", () => {
  it("vira botão focável que responde a Enter, Espaço e clique", () => {
    const acao = vi.fn();
    render(<div {...clicavel(acao)}>Abrir contrato</div>);
    const el = screen.getByRole("button", { name: "Abrir contrato" });
    expect(el).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(el, { key: "Enter" });
    fireEvent.keyDown(el, { key: " " });
    fireEvent.click(el);
    expect(acao).toHaveBeenCalledTimes(3);
  });

  it("ignora outras teclas", () => {
    const acao = vi.fn();
    render(<div {...clicavel(acao)}>Abrir</div>);
    fireEvent.keyDown(screen.getByRole("button"), { key: "a" });
    expect(acao).not.toHaveBeenCalled();
  });

  it("não intercepta teclas de um controle dentro do elemento", () => {
    const acao = vi.fn();
    render(
      <div {...clicavel(acao)}>
        <input aria-label="Quantidade" />
      </div>,
    );
    fireEvent.keyDown(screen.getByLabelText("Quantidade"), { key: " " });
    expect(acao).not.toHaveBeenCalled();
  });

  it("em linha de tabela, mantém a semântica de linha", () => {
    const acao = vi.fn();
    render(
      <table>
        <tbody>
          <tr {...clicavel(acao, { linha: true })}>
            <td>Parcela 1</td>
          </tr>
        </tbody>
      </table>,
    );
    const linha = screen.getByRole("row");
    expect(linha).toHaveAttribute("tabindex", "0");
    expect(screen.queryByRole("button")).toBeNull();
    fireEvent.keyDown(linha, { key: "Enter" });
    expect(acao).toHaveBeenCalledTimes(1);
  });
});
