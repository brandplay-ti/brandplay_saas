import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const estado = vi.hoisted(() => ({ podeEditar: true }));

vi.mock("@/integrations/supabase/client", () => {
  const OPORTUNIDADE = {
    id: "op-1", organization_id: "org-1", brand: "Marca Verde", value: 50000, stage: "negociacao",
    position: 0, property_id: null, sponsor_id: null, assignee_id: null, owner_id: "user-1",
    expected_close_date: null, notes: null, pipeline_funnel_id: null, tier_id: null,
    lost_reason: null, lost_comment: null, lost_competitor: null, lost_value: null,
    created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", last_stage_change_at: "2026-11-20T00:00:00Z",
  };
  function tabela(nome: string) {
    const resultado = { data: nome === "opportunities" ? [OPORTUNIDADE] : [], error: null };
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
  return {
    supabase: {
      from: (nome: string) => tabela(nome),
      rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
      functions: { invoke: vi.fn() },
    },
  };
});

vi.mock("@/hooks/useOrganization", () => ({
  useOrganization: () => ({ orgId: "org-1", isAdmin: false, can: () => true, canWrite: () => estado.podeEditar }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/components/pipeline/OpportunityDrawer", () => ({ OpportunityDrawer: () => null }));
vi.mock("@/components/pipeline/StageProbabilitiesDialog", async (original) => ({
  ...(await original<typeof import("@/components/pipeline/StageProbabilitiesDialog")>()),
  StageProbabilitiesDialog: () => null,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

// O `localStorage` do Node mais novo encobre o do jsdom (como em useFiltroSalvo.test).
const armazenado = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => armazenado.get(k) ?? null,
  setItem: (k: string, v: string) => void armazenado.set(k, v),
  removeItem: (k: string) => void armazenado.delete(k),
  clear: () => armazenado.clear(),
});

import Pipeline from "./Pipeline";

const tela = (modo: "kanban" | "list" | "compact") => {
  armazenado.set("pipeline_view_mode", modo);
  return render(<MemoryRouter><Pipeline /></MemoryRouter>);
};

describe("Pipeline — somente leitura (BP-29)", () => {
  beforeEach(() => {
    armazenado.clear();
    estado.podeEditar = true;
  });

  it("no quadro, quem só lê o Funil vê os cards sem arrastar, excluir nem trocar responsável", async () => {
    estado.podeEditar = false;
    tela("kanban");
    expect(await screen.findByText("Marca Verde")).toBeInTheDocument();
    expect(screen.getAllByRole("status").some((s) => s.textContent?.includes("Somente leitura"))).toBe(true);
    expect(screen.queryByRole("button", { name: /Nova oportunidade/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Arrastar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excluir" })).not.toBeInTheDocument();
    expect(screen.queryByText("Solte aqui")).not.toBeInTheDocument();
  });

  it("na lista compacta, quem só lê não troca o estágio nem exclui", async () => {
    estado.podeEditar = false;
    tela("compact");
    const card = (await screen.findByText("Marca Verde")).closest("[role=\"button\"]") as HTMLElement;
    expect(within(card).queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excluir oportunidade" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir detalhes" })).toBeInTheDocument();
  });

  it("quem edita o Funil cria, arrasta e exclui", async () => {
    tela("kanban");
    expect(await screen.findByRole("button", { name: "Arrastar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Nova oportunidade/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excluir" })).toBeInTheDocument();
  });
});
