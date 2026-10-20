import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const resetPasswordForEmail = vi.fn();
const updateUser = vi.fn();
const auth = { session: null as unknown, loading: false };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: (...args: unknown[]) => resetPasswordForEmail(...args),
      updateUser: (...args: unknown[]) => updateUser(...args),
    },
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ ...auth, user: null }),
}));

import EsqueciSenha from "./EsqueciSenha";
import ResetarSenha from "./ResetarSenha";

const sessao = { user: { id: "u1", email: "fulano@empresa.com" } };

function abrir(elemento: JSX.Element, rota: string) {
  return render(<MemoryRouter initialEntries={[rota]}>{elemento}</MemoryRouter>);
}

beforeEach(() => {
  resetPasswordForEmail.mockReset();
  updateUser.mockReset();
  auth.session = null;
  auth.loading = false;
  window.history.replaceState(null, "", "/");
});

describe("EsqueciSenha", () => {
  it("pede o link com o e-mail normalizado e volta para o portal quando veio de lá", async () => {
    resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    abrir(<EsqueciSenha />, "/esqueci-senha?destino=portal");

    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: " Fulano@Empresa.com " } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar link de recuperação" }));

    await screen.findByText(/enviamos um link/);
    expect(resetPasswordForEmail).toHaveBeenCalledWith("fulano@empresa.com", {
      redirectTo: `${window.location.origin}/resetar-senha?destino=portal`,
    });
    expect(screen.getByRole("link", { name: /Voltar para o login/ })).toHaveAttribute("href", "/portal/login");
  });

  it("não chama o Auth com e-mail inválido", async () => {
    abrir(<EsqueciSenha />, "/esqueci-senha");

    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "fulano@" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar link de recuperação" }));

    await screen.findByText("Informe um e-mail válido.");
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("mostra o limite de envio sem dizer se a conta existe", async () => {
    resetPasswordForEmail.mockResolvedValue({ data: null, error: { status: 429, code: "over_email_send_rate_limit" } });
    abrir(<EsqueciSenha />, "/esqueci-senha");

    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "fulano@empresa.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar link de recuperação" }));

    await screen.findByText(/Aguarde um minuto/);
  });
});

describe("ResetarSenha", () => {
  it("sem sessão de recuperação, oferece um novo link", () => {
    abrir(<ResetarSenha />, "/resetar-senha");

    expect(screen.getByRole("heading", { name: "Link inválido" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pedir um novo link" })).toHaveAttribute("href", "/esqueci-senha");
  });

  it("link vencido não mostra o formulário mesmo para quem já estava logado", () => {
    auth.session = sessao;
    window.history.replaceState(null, "", "/resetar-senha#error=access_denied&error_code=otp_expired");
    abrir(<ResetarSenha />, "/resetar-senha");

    expect(screen.getByText(/expirou ou já foi usado/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Nova senha")).not.toBeInTheDocument();
  });

  it("não envia com confirmação diferente", async () => {
    auth.session = sessao;
    abrir(<ResetarSenha />, "/resetar-senha");

    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "nova-senha" } });
    fireEvent.change(screen.getByLabelText("Confirmar nova senha"), { target: { value: "outra-senha" } });
    fireEvent.click(screen.getByRole("button", { name: "Redefinir senha" }));

    await screen.findByText("As senhas não coincidem.");
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("troca a senha da conta da sessão e mostra a conclusão", async () => {
    auth.session = sessao;
    updateUser.mockResolvedValue({ data: { user: sessao.user }, error: null });
    abrir(<ResetarSenha />, "/resetar-senha");

    expect(screen.getByText("fulano@empresa.com")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "nova-senha" } });
    fireEvent.change(screen.getByLabelText("Confirmar nova senha"), { target: { value: "nova-senha" } });
    fireEvent.click(screen.getByRole("button", { name: "Redefinir senha" }));

    await screen.findByRole("heading", { name: "Senha redefinida" });
    expect(updateUser).toHaveBeenCalledWith({ password: "nova-senha" });
  });

  it("explica quando a nova senha é igual à atual", async () => {
    auth.session = sessao;
    updateUser.mockResolvedValue({ data: { user: null }, error: { status: 422, code: "same_password" } });
    abrir(<ResetarSenha />, "/resetar-senha");

    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "mesma-senha" } });
    fireEvent.change(screen.getByLabelText("Confirmar nova senha"), { target: { value: "mesma-senha" } });
    fireEvent.click(screen.getByRole("button", { name: "Redefinir senha" }));

    await waitFor(() => expect(screen.getByText(/diferente da atual/)).toBeInTheDocument());
  });
});
