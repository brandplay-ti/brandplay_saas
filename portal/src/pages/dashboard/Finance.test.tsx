import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const estado = vi.hoisted(() => ({ podeEditar: true, alteradas: [] as { id: string }[] }));

vi.mock("@/integrations/supabase/client", () => {
  const PARCELA = {
    id: "p1", contract_id: "ct-1", installment_number: 1, total_installments: 3, amount: 10000,
    due_date: "2026-12-10", status: "pendente", paid_at: null, paid_amount: null, payment_method: "boleto",
    contracts: { title: "Patrocínio Master", brand: "Marca Azul", contract_number: "CTR-1" },
  };
  function tabela() {
    let resultado: { data: unknown; error: unknown } = { data: [PARCELA], error: null };
    const consulta: Record<string | symbol, unknown> = new Proxy(
      {},
      {
        get: (_alvo, chave) => {
          if (chave === "then") {
            return (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
              Promise.resolve(resultado).then(resolve, reject);
          }
          return () => {
            if (chave === "update") resultado = { data: estado.alteradas, error: null };
            return consulta;
          };
        },
      },
    );
    return consulta;
  }
  return { supabase: { from: () => tabela(), rpc: vi.fn(() => Promise.resolve({ data: null, error: null })) } };
});
vi.mock("@/hooks/useOrganization", () => ({
  useOrganization: () => ({ orgId: "org-1", can: () => true, canWrite: () => estado.podeEditar }),
}));
// Mesmo objeto a cada render: a carga da página depende de `user`.
const auth = vi.hoisted(() => ({ user: { id: "user-1" } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const armazenado = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => armazenado.get(k) ?? null,
  setItem: (k: string, v: string) => void armazenado.set(k, v),
  removeItem: (k: string) => void armazenado.delete(k),
  clear: () => armazenado.clear(),
});

// O gráfico não importa aqui, e o recharts mede o contêiner (sem ResizeObserver no jsdom).
vi.mock("recharts", () => {
  const Vazio = () => null;
  return {
    ResponsiveContainer: Vazio, BarChart: Vazio, Bar: Vazio, XAxis: Vazio, YAxis: Vazio,
    CartesianGrid: Vazio, Tooltip: Vazio, Legend: Vazio,
  };
});

import { toast } from "sonner";
import Finance from "./Finance";
import { mensagemSemEdicao } from "@/lib/permissoes";

const abrirParcela = async () => {
  render(<MemoryRouter><Finance /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Detalhes" }));
  return screen.findByRole("dialog");
};

describe("Financeiro — somente leitura (BP-29)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    armazenado.clear();
    estado.podeEditar = true;
    estado.alteradas = [];
  });

  it("quem só lê o Financeiro vê a parcela sem dar baixa, e com o aviso", async () => {
    estado.podeEditar = false;
    const detalhe = await abrirParcela();
    expect(detalhe).toHaveTextContent("Somente leitura");
    expect(screen.queryByRole("button", { name: /Marcar como paga/ })).not.toBeInTheDocument();
  });

  it("baixa que a RLS não aplicou avisa, em vez de dizer que a parcela foi paga", async () => {
    await abrirParcela();
    fireEvent.click(screen.getByRole("button", { name: /Marcar como paga/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Erro", { description: mensagemSemEdicao("financeiro") }));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("baixa aplicada confirma", async () => {
    estado.alteradas = [{ id: "p1" }];
    await abrirParcela();
    fireEvent.click(screen.getByRole("button", { name: /Marcar como paga/ }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Parcela marcada como paga"));
  });
});
