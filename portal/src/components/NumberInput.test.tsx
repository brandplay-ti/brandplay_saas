import { useState, type ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NumberInput } from "./NumberInput";

function Campo({
  inicial = "",
  aoMudar,
  ...props
}: { inicial?: string | number; aoMudar?: (v: string) => void } & Omit<
  ComponentProps<typeof NumberInput>,
  "value" | "onValueChange"
>) {
  const [valor, setValor] = useState<string | number>(inicial);
  return (
    <>
      <NumberInput
        aria-label="Número"
        value={valor}
        onValueChange={(v) => {
          setValor(v);
          aoMudar?.(v);
        }}
        {...props}
      />
      <button onClick={() => setValor(5000)}>trocar</button>
    </>
  );
}

const campo = () => screen.getByLabelText("Número") as HTMLInputElement;
const digitar = (texto: string) => fireEvent.change(campo(), { target: { value: texto } });

describe("NumberInput", () => {
  it("mostra o valor salvo com marcador de milhar", () => {
    render(<Campo inicial={1234567} />);
    expect(campo().value).toBe("1.234.567");
  });

  it("aplica o marcador ao digitar e entrega só dígitos", () => {
    const aoMudar = vi.fn();
    render(<Campo aoMudar={aoMudar} />);
    digitar("1234");
    expect(campo().value).toBe("1.234");
    expect(aoMudar).toHaveBeenLastCalledWith("1234");
  });

  it("esvazia de verdade", () => {
    const aoMudar = vi.fn();
    render(<Campo inicial="5" aoMudar={aoMudar} />);
    digitar("");
    expect(campo().value).toBe("");
    expect(aoMudar).toHaveBeenLastCalledWith("");
  });

  it("segue o valor que muda por fora", () => {
    render(<Campo inicial="1" />);
    fireEvent.click(screen.getByText("trocar"));
    expect(campo().value).toBe("5.000");
  });

  it("volta ao valor que o formulário impõe", () => {
    function ComPiso() {
      const [valor, setValor] = useState(3);
      return (
        <NumberInput
          aria-label="Número"
          value={valor}
          onValueChange={(v) => setValor(Math.max(1, parseInt(v) || 1))}
        />
      );
    }
    render(<ComPiso />);
    digitar("");
    expect(campo().value).toBe("1");
  });

  it("não deixa o cursor pular ao editar no meio", () => {
    render(<Campo inicial="1234" />);
    // "1.2|34": apaga o 2, sobram 134 e o cursor fica depois do 1.
    fireEvent.change(campo(), { target: { value: "1.34", selectionStart: 1, selectionEnd: 1 } });
    expect(campo().value).toBe("134");
    expect(campo().selectionStart).toBe(1);
  });

  it("mantém a vírgula enquanto os decimais são digitados", () => {
    const aoMudar = vi.fn();
    render(<Campo casas={2} aoMudar={aoMudar} />);
    digitar("1234,");
    expect(campo().value).toBe("1.234,");
    digitar("1.234,0");
    expect(campo().value).toBe("1.234,0");
    digitar("1.234,05");
    expect(campo().value).toBe("1.234,05");
    expect(aoMudar).toHaveBeenLastCalledWith("1234.05");
  });

  it("aceita valor em decimal brasileiro do formulário", () => {
    function Brasileiro() {
      const [valor, setValor] = useState("12,5");
      return (
        <NumberInput
          aria-label="Número"
          casas={4}
          value={valor}
          onValueChange={(v) => setValor(v.replace(".", ","))}
        />
      );
    }
    render(<Brasileiro />);
    expect(campo().value).toBe("12,5");
    digitar("12,50");
    expect(campo().value).toBe("12,50");
    digitar("12,507");
    expect(campo().value).toBe("12,507");
  });

  it("aceita negativo só quando pedido", () => {
    const { unmount } = render(<Campo />);
    digitar("-5");
    expect(campo().value).toBe("5");
    unmount();

    render(<Campo permitirNegativo />);
    digitar("-");
    expect(campo().value).toBe("-");
    digitar("-1500");
    expect(campo().value).toBe("-1.500");
  });

  it("número fora da faixa segura o envio do formulário", () => {
    render(<Campo min="1" max={2000} />);
    digitar("0");
    expect(campo().validity.customError).toBe(true);
    digitar("1500");
    expect(campo().validity.customError).toBe(false);
    digitar("3000");
    expect(campo().validationMessage).toBe("O máximo é 2.000.");
  });
});
