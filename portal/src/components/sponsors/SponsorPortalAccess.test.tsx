import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const estado = vi.hoisted(() => ({ podeEditar: true }));

vi.mock("@/integrations/supabase/client", () => {
  const linhas: Record<string, unknown[]> = {
    sponsor_invites: [{ id: "i1", email: "contato@marca.com", token: "tok", status: "pendente", expires_at: "2026-12-01T00:00:00Z", created_at: "2026-11-01T00:00:00Z", accepted_at: null }],
    sponsor_portal_access: [{ id: "a1", user_id: "u2", status: "ativo", created_at: "2026-11-01T00:00:00Z" }],
  };
  function tabela(nome: string) {
    const resultado = { data: linhas[nome] ?? [], error: null };
    const consulta: Record<string | symbol, unknown> = new Proxy(
      {},
      {
        get: (_alvo, chave) => {
          if (chave === "then") {
            return (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
              Promise.resolve(resultado).then(resolve, reject);
          }
          return () => consulta;
        },
      },
    );
    return consulta;
  }
  return { supabase: { from: (nome: string) => tabela(nome), functions: { invoke: vi.fn() } } };
});

vi.mock("@/lib/profileNames", () => ({
  withProfileNames: (linhas: unknown[]) => Promise.resolve(linhas.map((l) => ({ ...(l as object), profiles: { full_name: "Ana Patrocinadora" } }))),
}));
vi.mock("@/hooks/useOrganization", () => ({
  useOrganization: () => ({ orgId: "org-1", canWrite: () => estado.podeEditar }),
}));
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { SponsorPortalAccess } from "./SponsorPortalAccess";

describe("SponsorPortalAccess — somente leitura (BP-29)", () => {
  beforeEach(() => {
    estado.podeEditar = true;
  });

  it("quem só lê o CRM vê acessos e convites, sem ativar, convidar, bloquear nem remover", async () => {
    estado.podeEditar = false;
    render(<SponsorPortalAccess sponsorId="sp-1" />);
    expect(await screen.findByText("Ana Patrocinadora")).toBeInTheDocument();
    expect(screen.getByText("contato@marca.com")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Somente leitura");
    expect(screen.queryByPlaceholderText("email@patrocinador.com")).not.toBeInTheDocument();
    for (const nome of [/Ativar/, /Convidar/, /Bloquear/, "Remover acesso ao portal", "Cancelar convite"]) {
      expect(screen.queryByRole("button", { name: nome })).not.toBeInTheDocument();
    }
  });

  it("quem edita o CRM vê as ações", async () => {
    render(<SponsorPortalAccess sponsorId="sp-1" />);
    expect(await screen.findByRole("button", { name: /Bloquear/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Convidar/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar convite" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
