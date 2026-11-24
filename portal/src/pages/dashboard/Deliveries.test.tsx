import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const estado = vi.hoisted(() => ({ escreve: new Set<string>(), isAdmin: false }));

vi.mock("@/integrations/supabase/client", () => {
  const ENTREGA = {
    id: "d1", organization_id: "org-1", title: "Placa de LED", brand: "Marca Azul", asset_type: null,
    quantity: 1, due_date: "2099-12-01", description: null, notes: null, evidence_url: null,
    status: "pendente", approval: "pendente", approval_comment: null, delivered_at: null,
    property_id: null, opportunity_id: null, sponsor_id: null, contract_id: null, created_at: "2026-11-01T00:00:00Z",
  };
  function tabela(nome: string) {
    const resultado = { data: nome === "deliveries" ? [ENTREGA] : [], error: null };
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
      functions: { invoke: vi.fn() },
      storage: { from: () => ({ createSignedUrl: () => Promise.resolve({ data: null }) }) },
    },
  };
});

const auth = vi.hoisted(() => ({ user: { id: "user-1" } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("@/hooks/useOrganization", () => ({
  useOrganization: () => ({
    orgId: "org-1",
    isAdmin: estado.isAdmin,
    can: () => true,
    canWrite: (m: string) => estado.escreve.has(m),
  }),
}));
vi.mock("@/components/pipeline/NextStepsAI", () => ({ NextStepsAI: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const armazenado = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => armazenado.get(k) ?? null,
  setItem: (k: string, v: string) => void armazenado.set(k, v),
  removeItem: (k: string) => void armazenado.delete(k),
  clear: () => armazenado.clear(),
});

import Deliveries from "./Deliveries";

const tela = () => render(<MemoryRouter><Deliveries /></MemoryRouter>);

describe("Entregas — somente leitura (BP-29)", () => {
  beforeEach(() => {
    armazenado.clear();
    estado.escreve = new Set();
    estado.isAdmin = false;
  });

  it("no quadro, quem não edita Entregas nem CRM vê as entregas sem criar, arrastar nem editar", async () => {
    tela();
    expect(await screen.findByText("Placa de LED")).toBeInTheDocument();
    expect(screen.getAllByRole("status").some((s) => s.textContent?.includes("Somente leitura"))).toBe(true);
    expect(screen.queryByRole("button", { name: /Nova entrega/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Arrastar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar entrega" })).not.toBeInTheDocument();
  });

  it("no detalhe, quem só lê não aprova, não edita nem exclui", async () => {
    tela();
    fireEvent.click(await screen.findByText("Placa de LED"));
    const detalhe = await screen.findByRole("dialog");
    expect(within(detalhe).queryByRole("button", { name: /Aprovar/ })).not.toBeInTheDocument();
    expect(within(detalhe).queryByRole("button", { name: /^Editar/ })).not.toBeInTheDocument();
    expect(within(detalhe).queryByRole("button", { name: /Excluir/ })).not.toBeInTheDocument();
  });

  it("quem edita Entregas cria, arrasta e aprova; excluir segue com owner/admin", async () => {
    estado.escreve = new Set(["operacional"]);
    tela();
    expect(await screen.findByRole("button", { name: "Arrastar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Nova entrega/ })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Placa de LED"));
    const detalhe = await screen.findByRole("dialog");
    expect(within(detalhe).getByRole("button", { name: /Aprovar/ })).toBeInTheDocument();
    expect(within(detalhe).queryByRole("button", { name: /Excluir/ })).not.toBeInTheDocument();
  });
});
