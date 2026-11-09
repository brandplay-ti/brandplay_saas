import { useState, type ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DateInput } from "./DateInput";

function Campo({
  inicial = "",
  aoMudar,
  ...props
}: { inicial?: string; aoMudar?: (v: string) => void } & Omit<ComponentProps<typeof DateInput>, "value" | "onValueChange">) {
  const [valor, setValor] = useState(inicial);
  return (
    <>
      <DateInput
        aria-label="Data"
        value={valor}
        onValueChange={(v) => {
          setValor(v);
          aoMudar?.(v);
        }}
        {...props}
      />
      <button onClick={() => setValor("2030-01-02")}>trocar</button>
      <span data-testid="iso">{valor}</span>
    </>
  );
}

const campo = () => screen.getByLabelText("Data") as HTMLInputElement;
const digitar = (texto: string) => fireEvent.change(campo(), { target: { value: texto } });

describe("DateInput", () => {
  it("mostra o valor salvo no padrão brasileiro", () => {
    render(<Campo inicial="2026-03-12" />);
    expect(campo().value).toBe("12/03/2026");
  });

  it("aplica a máscara e entrega ISO só com a data completa", () => {
    const aoMudar = vi.fn();
    render(<Campo aoMudar={aoMudar} />);

    digitar("1203");
    expect(campo().value).toBe("12/03");
    expect(aoMudar).not.toHaveBeenCalled();

    digitar("12/03/2026");
    expect(campo().value).toBe("12/03/2026");
    expect(aoMudar).toHaveBeenCalledTimes(1);
    expect(aoMudar).toHaveBeenCalledWith("2026-03-12");
  });

  it("não apaga o texto incompleto quando o ISO volta vazio", () => {
    render(<Campo inicial="2026-03-12" />);
    digitar("12/03/202");
    expect(screen.getByTestId("iso").textContent).toBe("");
    expect(campo().value).toBe("12/03/202");
  });

  it("segue o valor que muda por fora", () => {
    render(<Campo inicial="2026-03-12" />);
    fireEvent.click(screen.getByText("trocar"));
    expect(campo().value).toBe("02/01/2030");
  });

  it("marca data inválida só depois de sair do campo", () => {
    render(<Campo />);
    digitar("31/02/2026");
    expect(campo().getAttribute("aria-invalid")).toBeNull();
    expect(campo().validity.customError).toBe(true);

    fireEvent.blur(campo());
    expect(campo().getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByTestId("iso").textContent).toBe("");

    digitar("28/02/2026");
    expect(campo().validity.customError).toBe(false);
  });

  it("onCommit entrega a data ao sair e ignora texto inválido", () => {
    const onCommit = vi.fn();
    render(<Campo onCommit={onCommit} />);

    digitar("12/03");
    fireEvent.blur(campo());
    expect(onCommit).not.toHaveBeenCalled();

    digitar("12/03/2026");
    fireEvent.blur(campo());
    expect(onCommit).toHaveBeenCalledWith("2026-03-12");

    digitar("");
    fireEvent.blur(campo());
    expect(onCommit).toHaveBeenLastCalledWith("");
  });

  it("respeita o limite mínimo", () => {
    render(<Campo min="2026-03-10" />);
    digitar("09/03/2026");
    expect(screen.getByTestId("iso").textContent).toBe("");
    fireEvent.blur(campo());
    expect(campo().getAttribute("aria-invalid")).toBe("true");
  });

  it("funciona com hora", () => {
    render(<Campo withTime inicial="2026-03-12T14:30" />);
    expect(campo().value).toBe("12/03/2026 14:30");

    digitar("12/03/2026 15:45");
    expect(screen.getByTestId("iso").textContent).toBe("2026-03-12T15:45");
  });

  it("não controlado: começa do defaultValue", () => {
    render(<DateInput aria-label="Data" defaultValue="2026-03-12" />);
    expect(campo().value).toBe("12/03/2026");
    digitar("13/03/2026");
    expect(campo().value).toBe("13/03/2026");
  });

  it("corrige um dígito no meio sem o cursor pular para o fim", () => {
    render(<Campo inicial="2026-03-20" />);
    // Backspace com o cursor depois do "20": sobra "2/03/2026", cursor na posição 1.
    fireEvent.change(campo(), { target: { value: "2/03/2026", selectionStart: 1, selectionEnd: 1 } });
    expect(campo().selectionStart).toBe(1);

    // Digita 5 ali: volta a ter 8 dígitos e o cursor fica depois do dia.
    fireEvent.change(campo(), { target: { value: "250/32/026", selectionStart: 2, selectionEnd: 2 } });
    expect(campo().value).toBe("25/03/2026");
    expect(campo().selectionStart).toBe(2);
    expect(screen.getByTestId("iso").textContent).toBe("2026-03-25");
  });

  it("recusa dígito a mais no meio em vez de empurrar os outros", () => {
    render(<Campo inicial="2026-03-20" />);
    fireEvent.change(campo(), { target: { value: "205/03/2026", selectionStart: 3, selectionEnd: 3 } });
    expect(campo().value).toBe("20/03/2026");
    expect(screen.getByTestId("iso").textContent).toBe("2026-03-20");
  });

  it("tem botão acessível para abrir o calendário", () => {
    render(<Campo />);
    expect(screen.getByRole("button", { name: "Abrir calendário" })).toBeTruthy();
  });
});
