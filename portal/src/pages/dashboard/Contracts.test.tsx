import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const estado = vi.hoisted(() => ({
  escreve: new Set<string>(),
  isAdmin: false,
  apagados: [] as { id: string }[],
  remover: vi.fn(() => Promise.resolve({ data: null, error: null })),
}));

vi.mock("@/integrations/supabase/client", () => {
  const CONTRATO = {
    id: "ct-1", organization_id: "org-1", title: "Patrocínio Master 2027", brand: "Marca Azul",
    contract_number: "CTR-1", total_value: 120000, start_date: "2026-01-01", end_date: "2027-12-31",
    status: "ativo", payment_method: "a_vista", installments: 1, due_day: null, due_days: null,
    custom_due_dates: [], signatories: null, notes: null, property_id: null, opportunity_id: null,
    sponsor_id: null, file_path: "u1/ct-1-1.pdf", file_name: "contrato.pdf", ai_summary: null,
    use_flat_value: false, flat_value: 0, created_at: "2026-01-01T00:00:00Z",
  };
  function tabela(nome: string) {
    let resultado: { data: unknown; error: unknown } = { data: nome === "contracts" ? [CONTRATO] : [], error: null };
    const consulta: Record<string | symbol, unknown> = new Proxy(
      {},
      {
        get: (_alvo, chave) => {
          if (chave === "then") {
            return (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
              Promise.resolve(resultado).then(resolve, reject);
          }
          return () => {
            // A RLS recusa o DELETE sem erro: volta só o que foi apagado de fato.
            if (chave === "delete") resultado = { data: estado.apagados, error: null };
            return consulta;
          };
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
      storage: { from: () => ({ remove: estado.remover, createSignedUrl: vi.fn(() => Promise.resolve({ data: null, error: null })) }) },
      auth: { getSession: vi.fn() },
    },
  };
});

vi.mock("@/hooks/useOrganization", () => ({
  useOrganization: () => ({
    orgId: "org-1",
    isAdmin: estado.isAdmin,
    can: () => true,
    canWrite: (m: string) => estado.escreve.has(m),
  }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/components/pipeline/NextStepsAI", () => ({ NextStepsAI: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const armazenado = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => armazenado.get(k) ?? null,
  setItem: (k: string, v: string) => void armazenado.set(k, v),
  removeItem: (k: string) => void armazenado.delete(k),
  clear: () => armazenado.clear(),
});

import { toast } from "sonner";
import Contracts from "./Contracts";

const tela = () => render(<MemoryRouter><Contracts /></MemoryRouter>);

describe("Contratos — somente leitura (BP-29)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    armazenado.clear();
    estado.escreve = new Set();
    estado.isAdmin = false;
    estado.apagados = [];
  });

  it("quem não edita CRM nem Financeiro vê os contratos sem criar nem excluir, e com o aviso", async () => {
    tela();
    expect(await screen.findByText("Patrocínio Master 2027")).toBeInTheDocument();
    expect(screen.getAllByRole("status").some((s) => s.textContent?.includes("não edita Patrocinadores e CRM nem Financeiro"))).toBe(true);
    expect(screen.queryByRole("button", { name: /Novo contrato/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excluir contrato" })).not.toBeInTheDocument();
  });

  it("no detalhe, quem só lê não muda status, não remove arquivo nem edita cláusulas", async () => {
    tela();
    fireEvent.click(await screen.findByText("Patrocínio Master 2027"));
    const detalhe = await screen.findByRole("dialog");
    expect(within(detalhe).queryByRole("button", { name: /Editar/ })).not.toBeInTheDocument();
    expect(within(detalhe).queryByRole("button", { name: "Remover arquivo" })).not.toBeInTheDocument();
    expect(within(detalhe).getByRole("combobox")).toBeDisabled();
    expect(within(detalhe).queryByRole("button", { name: /Excluir contrato/ })).not.toBeInTheDocument();
  });

  it("escrever no Financeiro basta para criar (policy crm OR financeiro), mas excluir é de owner/admin", async () => {
    estado.escreve = new Set(["financeiro"]);
    tela();
    expect(await screen.findByRole("button", { name: /Novo contrato/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excluir contrato" })).not.toBeInTheDocument();
  });

  it("exclusão que a RLS não aplicou não apaga o arquivo do storage", async () => {
    estado.escreve = new Set(["crm"]);
    estado.isAdmin = true;
    tela();
    fireEvent.click(await screen.findByRole("button", { name: "Excluir contrato" }));
    fireEvent.click(await screen.findByRole("button", { name: "Excluir" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(estado.remover).not.toHaveBeenCalled();
  });

  it("exclusão aplicada apaga também o arquivo", async () => {
    estado.escreve = new Set(["crm"]);
    estado.isAdmin = true;
    estado.apagados = [{ id: "ct-1" }];
    tela();
    fireEvent.click(await screen.findByRole("button", { name: "Excluir contrato" }));
    fireEvent.click(await screen.findByRole("button", { name: "Excluir" }));
    await waitFor(() => expect(estado.remover).toHaveBeenCalledWith(["u1/ct-1-1.pdf"]));
  });
});
