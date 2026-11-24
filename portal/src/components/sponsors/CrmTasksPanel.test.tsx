import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const estado = vi.hoisted(() => ({
  podeEditar: true,
  erroNaEscrita: null as { code?: string; message: string } | null,
  escritas: [] as { tabela: string; metodo: string }[],
}));

vi.mock("@/integrations/supabase/client", () => {
  // Qualquer encadeamento devolve a mesma consulta; escrita registra e usa o erro configurado.
  function tabela(nome: string) {
    let resultado: { data: unknown; error: unknown } = {
      data: [{ id: "t1", title: "Ligar para a marca", description: null, task_type: "followup", priority: "media", status: "aberta", due_date: null, assignee_id: null, source: "manual", completed_at: null }],
      error: null,
    };
    const consulta: Record<string | symbol, unknown> = new Proxy(
      {},
      {
        get: (_alvo, chave) => {
          if (chave === "then") {
            return (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
              Promise.resolve(resultado).then(resolve, reject);
          }
          return () => {
            if (chave === "insert" || chave === "update" || chave === "delete") {
              estado.escritas.push({ tabela: nome, metodo: String(chave) });
              resultado = { data: null, error: estado.erroNaEscrita };
            }
            return consulta;
          };
        },
      },
    );
    return consulta;
  }
  return { supabase: { from: (nome: string) => tabela(nome), functions: { invoke: vi.fn() } } };
});

vi.mock("@/hooks/useOrganization", () => ({
  useOrganization: () => ({ orgId: "org-1", can: () => true, canWrite: () => estado.podeEditar }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/components/common/TaskInsightsDialog", () => ({ TaskInsightsDialog: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from "sonner";
import { CrmTasksPanel } from "./CrmTasksPanel";
import { mensagemSemEdicao } from "@/lib/permissoes";

const tela = () => render(<MemoryRouter><CrmTasksPanel sponsorId="sp-1" /></MemoryRouter>);

describe("CrmTasksPanel — somente leitura (BP-29)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estado.podeEditar = true;
    estado.erroNaEscrita = null;
    estado.escritas = [];
  });

  it("quem só lê o CRM vê as tarefas, sem criar, concluir nem excluir, e com o aviso", async () => {
    estado.podeEditar = false;
    tela();
    expect(await screen.findByText("Ligar para a marca")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Somente leitura");
    expect(screen.queryByRole("button", { name: /Adicionar tarefa/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Concluir tarefa" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excluir tarefa" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Editar prazos em lote/ })).not.toBeInTheDocument();
  });

  it("quem edita o CRM vê as ações e não vê o aviso", async () => {
    tela();
    expect(await screen.findByRole("button", { name: "Excluir tarefa" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Adicionar tarefa/ })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("recusa 42501 vira o aviso de permissão, não a mensagem do Postgres", async () => {
    estado.erroNaEscrita = { code: "42501", message: 'new row violates row-level security policy for table "crm_tasks"' };
    tela();
    fireEvent.click(await screen.findByRole("button", { name: "Excluir tarefa" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Erro", { description: mensagemSemEdicao("crm") }));
    expect(estado.escritas).toEqual([{ tabela: "crm_tasks", metodo: "delete" }]);
  });
});
