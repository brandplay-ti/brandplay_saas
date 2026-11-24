import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const estado = vi.hoisted(() => ({ podeEditar: true }));

vi.mock("@/integrations/supabase/client", () => {
  function tabela() {
    const resultado = { data: [], error: null };
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
  return { supabase: { from: () => tabela(), functions: { invoke: vi.fn() } } };
});
vi.mock("@/hooks/useOrganization", () => ({
  useOrganization: () => ({ orgId: "org-1", can: () => true, canWrite: () => estado.podeEditar }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import LeadScoring from "./LeadScoring";

const tela = () => render(<MemoryRouter><LeadScoring /></MemoryRouter>);

describe("Lead scoring — somente leitura (BP-29)", () => {
  beforeEach(() => {
    estado.podeEditar = true;
  });

  it("quem só lê o Funil vê o ranking sem gerar notas com IA", () => {
    estado.podeEditar = false;
    tela();
    expect(screen.getAllByRole("status").some((s) => s.textContent?.includes("Somente leitura"))).toBe(true);
    expect(screen.queryByRole("button", { name: /Gerar \/ Atualizar com IA/ })).not.toBeInTheDocument();
  });

  it("quem edita o Funil gera as notas", () => {
    tela();
    expect(screen.getByRole("button", { name: /Gerar \/ Atualizar com IA/ })).toBeInTheDocument();
    expect(screen.queryByText("Somente leitura.")).not.toBeInTheDocument();
  });
});
