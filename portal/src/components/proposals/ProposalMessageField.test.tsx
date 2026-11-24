import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProposalMessageField } from "./ProposalMessageField";

function campo() {
  return screen.getByLabelText("Mensagem") as HTMLTextAreaElement;
}

describe("ProposalMessageField", () => {
  it("mostra o campo vazio e editável quando a proposta não tem mensagem", () => {
    render(<ProposalMessageField value={null} onSave={vi.fn()} />);
    expect(campo()).toHaveValue("");
    expect(campo()).not.toBeDisabled();
  });

  it("grava ao sair do campo quando o texto mudou", () => {
    const onSave = vi.fn();
    render(<ProposalMessageField value="Olá" onSave={onSave} />);

    fireEvent.change(campo(), { target: { value: "Olá, tudo bem?\nSegue a proposta." } });
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.blur(campo());

    expect(onSave).toHaveBeenCalledWith("Olá, tudo bem?\nSegue a proposta.");
  });

  it("não grava ao sair do campo sem mudança", () => {
    const onSave = vi.fn();
    render(<ProposalMessageField value="Olá" onSave={onSave} />);

    fireEvent.blur(campo());
    expect(onSave).not.toHaveBeenCalled();
  });

  it("apagar a mensagem grava null", () => {
    const onSave = vi.fn();
    render(<ProposalMessageField value="Olá" onSave={onSave} />);

    fireEvent.change(campo(), { target: { value: "   " } });
    fireEvent.blur(campo());

    expect(onSave).toHaveBeenCalledWith(null);
  });

  it("acompanha a mensagem trocada por fora", () => {
    const { rerender } = render(<ProposalMessageField value="Antiga" onSave={vi.fn()} />);
    rerender(<ProposalMessageField value="Nova, do assistente" onSave={vi.fn()} />);
    expect(campo()).toHaveValue("Nova, do assistente");
  });
});
