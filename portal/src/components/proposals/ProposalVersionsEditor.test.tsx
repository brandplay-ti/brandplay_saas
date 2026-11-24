import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const estado = vi.hoisted(() => ({
  inserts: [] as { tabela: string; linhas: unknown }[],
  erroNoInsert: null as { message: string } | null,
  versao: {
    id: "v1",
    channel: "concept",
    title: "Conceito Scout",
    content: "Conceito",
    metadata: {
      activations: [
        { title: "Blitz", description: "Na entrada", value: 1500, value_source: "manual" },
        { title: "Placa LED", description: "" },
        { title: "Sampling", description: "Degustação" },
      ],
    },
  },
}));

vi.mock("@/integrations/supabase/client", () => {
  // Qualquer encadeamento devolve a mesma consulta; `insert` registra as linhas.
  function tabela(nome: string) {
    let resultado: { data: unknown; error: unknown } = {
      data: nome === "proposal_versions" ? [estado.versao] : [],
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
          if (chave === "insert") {
            return (linhas: unknown) => {
              estado.inserts.push({ tabela: nome, linhas });
              resultado = { data: null, error: estado.erroNoInsert };
              return consulta;
            };
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
      auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: "user-1" } } })) },
    },
  };
});

vi.mock("./ProposalWizardDialog", () => ({ ProposalWizardDialog: () => null }));
const organizacao = vi.hoisted(() => ({ podeEditar: true }));
vi.mock("@/hooks/useOrganization", () => ({
  useOrganization: () => ({ orgId: "org-1", canWrite: () => organizacao.podeEditar }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ProposalVersionsEditor } from "./ProposalVersionsEditor";
import { AVISO_DA_ESTIMATIVA } from "./EstimativaAtivacoesDialog";

const PROPOSTA = {
  id: "prop-1",
  organization_id: "org-1",
  brand: "Marca X",
  sponsor_id: null,
  property_id: "proj-1",
  total_value: 0,
  message: null,
};

function tela(onItensAlterados = vi.fn()) {
  render(<ProposalVersionsEditor proposta={PROPOSTA} itens={[{ name: "Placa LED" }]} onItensAlterados={onItensAlterados} />);
  return onItensAlterados;
}

const insertsDeItens = () => estado.inserts.filter((i) => i.tabela === "proposal_items");

describe("ProposalVersionsEditor — ativações nos itens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estado.inserts = [];
    estado.erroNoInsert = null;
    organizacao.podeEditar = true;
  });

  it("inclui direto a ativação sem risco, com o valor dela e quantidade 1", async () => {
    const onItensAlterados = tela();
    const [blitz] = await screen.findAllByRole("button", { name: "Adicionar aos itens" });
    fireEvent.click(blitz);

    await waitFor(() => expect(onItensAlterados).toHaveBeenCalled());
    expect(insertsDeItens()).toEqual([{
      tabela: "proposal_items",
      linhas: [{ proposal_id: "prop-1", name: "Blitz", description: "Na entrada", quantity: 1, unit_value: 1500, position: 1 }],
    }]);
    expect(toast.success).toHaveBeenCalledWith("Ativação incluída nos itens.");
  });

  it("pede confirmação para incluir de novo uma ativação que já está nos itens", async () => {
    tela();
    fireEvent.click(await screen.findByRole("button", { name: "Adicionar de novo aos itens" }));

    const confirmacao = await screen.findByRole("alertdialog");
    expect(confirmacao).toHaveTextContent("Já está nos itens da proposta.");
    expect(insertsDeItens()).toHaveLength(0);

    fireEvent.click(within(confirmacao).getByRole("button", { name: "Incluir nos itens" }));
    await waitFor(() => expect(insertsDeItens()).toHaveLength(1));
  });

  it("adicionar todas pula as que já estão nos itens e mostra o acréscimo", async () => {
    const onItensAlterados = tela();
    fireEvent.click(await screen.findByRole("button", { name: "Adicionar todas aos itens" }));

    const confirmacao = await screen.findByRole("alertdialog");
    expect(confirmacao).toHaveTextContent("Incluir 2 ativações nos itens?");
    expect(confirmacao).toHaveTextContent(/1\.500,00/);
    fireEvent.click(within(confirmacao).getByRole("button", { name: "Incluir nos itens" }));

    await waitFor(() => expect(onItensAlterados).toHaveBeenCalled());
    expect(insertsDeItens()[0].linhas).toEqual([
      expect.objectContaining({ name: "Blitz", unit_value: 1500, position: 1 }),
      expect.objectContaining({ name: "Sampling", description: "Degustação", unit_value: 0, position: 2 }),
    ]);
  });

  it("falha no insert avisa e não recarrega os itens", async () => {
    estado.erroNoInsert = { message: "sem permissão" };
    const onItensAlterados = tela();
    const [blitz] = await screen.findAllByRole("button", { name: "Adicionar aos itens" });
    fireEvent.click(blitz);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Não foi possível incluir nos itens", expect.anything()));
    expect(onItensAlterados).not.toHaveBeenCalled();
  });
});

describe("ProposalVersionsEditor — sugestão de valores pela IA", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estado.inserts = [];
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        suggestions: [
          { index: 0, suggested_value: 2000, rationale: "Como a Copa Verão", overlaps_with: "Placa LED" },
          { index: 1, suggested_value: 800, rationale: "Placas da Copa Verão", overlaps_with: null },
          { index: 2, suggested_value: null, rationale: "Sem referência parecida na base da sua organização.", overlaps_with: null },
        ],
        modelo: "openai/modelo",
        sem_base: false,
      },
      error: null,
    } as never);
  });

  it("avisa que a base é a da organização e só aplica o que o usuário confirmou", async () => {
    tela();
    fireEvent.click(await screen.findByRole("button", { name: /Sugerir valores com IA/ }));

    const modal = await screen.findByRole("dialog");
    expect(modal).toHaveTextContent(AVISO_DA_ESTIMATIVA);
    fireEvent.click(within(modal).getByRole("button", { name: /Gerar sugestão/ }));

    await within(modal).findByText(/Pode duplicar o item "Placa LED"/);
    expect(supabase.functions.invoke).toHaveBeenCalledWith("estimate-activation-values", {
      body: expect.objectContaining({
        organization_id: "org-1",
        proposal_id: "prop-1",
        property_id: "proj-1",
        activations: [
          { title: "Blitz", description: "Na entrada" },
          { title: "Placa LED", description: "" },
          { title: "Sampling", description: "Degustação" },
        ],
      }),
    });
    expect(within(modal).getByText("Sem referência na sua base")).toBeInTheDocument();
    // Com risco de duplicar, a sugestão vem desmarcada.
    expect(within(modal).getAllByRole("checkbox", { name: "Usar este valor" }).map((c) => c.getAttribute("aria-checked")))
      .toEqual(["false", "true"]);

    fireEvent.click(within(modal).getByRole("button", { name: "Aplicar valores selecionados (1)" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const valores = screen.getAllByLabelText("Valor") as HTMLInputElement[];
    expect(valores[0].value).toMatch(/1\.500,00/);
    expect(valores[1].value).toMatch(/800,00/);
    expect(screen.getAllByText("Sugestão da IA")).toHaveLength(1);
    expect(insertsDeItens()).toHaveLength(0);
  });
});

describe("ProposalVersionsEditor — quem só lê o funil (BP-2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estado.inserts = [];
    estado.erroNoInsert = null;
    organizacao.podeEditar = false;
  });

  it("mostra as versões, avisa que é somente leitura e não deixa salvar nem incluir nos itens", async () => {
    tela();
    expect(await screen.findByDisplayValue("Conceito")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Somente leitura");
    for (const nome of ["Salvar", "Adicionar aos itens", "Adicionar todas aos itens"]) {
      for (const botao of screen.getAllByRole("button", { name: nome })) expect(botao).toBeDisabled();
    }
    fireEvent.click(screen.getAllByRole("button", { name: "Adicionar aos itens" })[0]);
    expect(insertsDeItens()).toHaveLength(0);
  });
});
