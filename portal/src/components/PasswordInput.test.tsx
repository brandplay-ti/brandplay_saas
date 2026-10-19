import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PasswordInput } from "./PasswordInput";

describe("PasswordInput", () => {
  it("começa com a senha oculta", () => {
    render(<PasswordInput aria-label="Senha" defaultValue="segredo" />);

    expect(screen.getByLabelText("Senha")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Mostrar senha" })).toBeInTheDocument();
  });

  it("mostra e volta a ocultar a senha pelo botão", () => {
    render(<PasswordInput aria-label="Senha" defaultValue="segredo" />);
    const campo = screen.getByLabelText("Senha");

    fireEvent.click(screen.getByRole("button", { name: "Mostrar senha" }));
    expect(campo).toHaveAttribute("type", "text");
    expect(campo).toHaveValue("segredo");

    fireEvent.click(screen.getByRole("button", { name: "Ocultar senha" }));
    expect(campo).toHaveAttribute("type", "password");
  });

  it("não envia o formulário ao alternar a visibilidade", () => {
    let enviado = false;
    render(
      <form
        onSubmit={(e) => {
          e.preventDefault();
          enviado = true;
        }}
      >
        <PasswordInput aria-label="Senha" />
      </form>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mostrar senha" }));
    expect(enviado).toBe(false);
  });

  it("desabilita o botão junto com o campo", () => {
    render(<PasswordInput aria-label="Senha" disabled />);

    expect(screen.getByLabelText("Senha")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mostrar senha" })).toBeDisabled();
  });
});
