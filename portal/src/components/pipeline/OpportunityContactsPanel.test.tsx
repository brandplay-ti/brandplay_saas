import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const estado = vi.hoisted(() => ({ podeEditar: true }));

vi.mock("@/integrations/supabase/client", () => {
  function tabela() {
    const resultado = { data: [{ id: "c1", name: "Ana Contato", role: "Diretora", email: null, phone: null, contact_type: "geral", is_primary: true }], error: null };
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
  return { supabase: { from: () => tabela() } };
});
vi.mock("@/hooks/useOrganization", () => ({
  useOrganization: () => ({ orgId: "org-1", canWrite: () => estado.podeEditar }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { OpportunityContactsPanel } from "./OpportunityContactsPanel";

describe("OpportunityContactsPanel — somente leitura (BP-29)", () => {
  beforeEach(() => {
    estado.podeEditar = true;
  });

  it("quem só lê o Funil vê os contatos sem adicionar nem remover, nem o alerta que pede contato", async () => {
    estado.podeEditar = false;
    render(<OpportunityContactsPanel opportunityId="op-1" sponsorId={null} hasContract hasInstallments />);
    expect(await screen.findByText("Ana Contato")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Adicionar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remover contato" })).not.toBeInTheDocument();
    expect(screen.queryByText(/informe o contato responsável/)).not.toBeInTheDocument();
  });

  it("quem edita o Funil adiciona e remove", async () => {
    render(<OpportunityContactsPanel opportunityId="op-1" sponsorId={null} />);
    expect(await screen.findByRole("button", { name: "Remover contato" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Adicionar/ })).toBeInTheDocument();
  });
});
