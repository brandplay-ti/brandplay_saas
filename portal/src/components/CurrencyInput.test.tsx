import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { CurrencyInput } from "./CurrencyInput";

function Campo({ inicial = "", aoMudar }: { inicial?: string; aoMudar?: (v: string) => void }) {
  const [valor, setValor] = useState(inicial);
  return (
    <CurrencyInput
      aria-label="Valor"
      value={valor}
      onValueChange={(v) => {
        setValor(v);
        aoMudar?.(v);
      }}
    />
  );
}

const campo = () => screen.getByLabelText("Valor") as HTMLInputElement;
const digitar = (texto: string) => fireEvent.change(campo(), { target: { value: texto } });

describe("CurrencyInput", () => {
  it("mostra o valor salvo com a máscara", () => {
    render(<Campo inicial="50000" />);
    expect(campo().value).toBe("R$ 50.000,00");
  });

  it("preenche da direita para a esquerda e entrega decimal com ponto", () => {
    const aoMudar = vi.fn();
    render(<Campo aoMudar={aoMudar} />);

    digitar("1");
    expect(campo().value).toBe("R$ 0,01");
    digitar("R$ 0,012");
    expect(campo().value).toBe("R$ 0,12");
    digitar("R$ 0,123");
    expect(campo().value).toBe("R$ 1,23");
    expect(aoMudar).toHaveBeenLastCalledWith("1.23");
  });

  it("esvazia com backspace em vez de prender em R$ 0,00", () => {
    render(<Campo inicial="0.01" />);
    digitar("R$ 0,0");
    expect(campo().value).toBe("");
  });

  it("aceita zero digitado de propósito", () => {
    const aoMudar = vi.fn();
    render(<Campo aoMudar={aoMudar} />);
    digitar("0");
    expect(campo().value).toBe("R$ 0,00");
    expect(aoMudar).toHaveBeenLastCalledWith("0.00");
  });

  it("recusa o que não cabe nas colunas de dinheiro", () => {
    render(<Campo inicial="999999999999.99" />);
    digitar("R$ 999.999.999.999,999");
    expect(campo().value).toBe("R$ 999.999.999.999,99");
  });

  it("trata o valor colado como reais", () => {
    render(<Campo />);
    const evento = createEvent.paste(campo(), { clipboardData: { getData: () => "1.500,00" } });
    fireEvent(campo(), evento);
    expect(evento.defaultPrevented).toBe(true);
    expect(campo().value).toBe("R$ 1.500,00");
  });

  it("usa as casas decimais pedidas", () => {
    render(<CurrencyInput aria-label="Valor" value="0.075" casas={4} onValueChange={() => {}} />);
    expect(campo().value).toBe("R$ 0,0750");
  });
});
