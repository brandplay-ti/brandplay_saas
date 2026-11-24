import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const estado = vi.hoisted(() => ({
  inserts: [] as { tabela: string; linhas: unknown }[],
  /** Erro devolvido pelo insert em `proposals` (ex.: a RLS recusando, BP-2). */
  erroNaProposta: null as { code: string; message: string } | null,
}));

vi.mock("@/integrations/supabase/client", () => {
  function tabela(nome: string) {
    let resultado: { data: unknown; error: unknown } = { data: [], error: null };
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
              resultado = nome === "proposals" && estado.erroNaProposta
                ? { data: null, error: estado.erroNaProposta }
                : { data: nome === "proposals" ? { id: "prop-nova" } : null, error: null };
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

const organizacao = vi.hoisted(() => ({ podeEditar: true }));
vi.mock("@/hooks/useOrganization", () => ({
  useOrganization: () => ({ orgId: "org-1", canWrite: () => organizacao.podeEditar }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ProposalWizardDialog } from "./ProposalWizardDialog";

const GERADO = {
  title: "Proposta Copa Verão",
  summary_message: "Mensagem",
  concept: "Conceito",
  activations: [
    { title: "Blitz", description: "Na entrada" },
    { title: "Sampling", description: "Degustação" },
  ],
  items: [{ name: "Placa LED", quantity: 2, unit_value: 1000 }],
  deck: "# Deck",
  whatsapp: "Oi",
  email: { subject: "Assunto", body_html: "<p>Olá</p>" },
  modelo: "anthropic/claude-modelo",
};

const inserts = (tabela: string) => estado.inserts.filter((i) => i.tabela === tabela).map((i) => i.linhas);

async function gerar() {
  fireEvent.click(screen.getByRole("button", { name: /Proposta Inteligente/ }));
  const marca = await screen.findByPlaceholderText("Ex: Pepsi Black");
  if (!(marca as HTMLInputElement).value) fireEvent.change(marca, { target: { value: "Marca X" } });
  fireEvent.click(screen.getByRole("button", { name: /Gerar com IA/ }));
  await screen.findByText("Blitz");
}

describe("ProposalWizardDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estado.inserts = [];
    estado.erroNaProposta = null;
    organizacao.podeEditar = true;
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: GERADO, error: null } as never);
  });

  it("proposta nova: a ativação marcada entra nos itens com o valor digitado, depois da confirmação", async () => {
    const onSaved = vi.fn();
    render(<ProposalWizardDialog onSaved={onSaved} />);
    await gerar();

    // Nenhuma vem marcada; o valor é manual.
    const marcar = screen.getAllByRole("checkbox", { name: "Incluir nos itens" });
    expect(marcar.map((c) => c.getAttribute("aria-checked"))).toEqual(["false", "false"]);
    fireEvent.click(marcar[0]);
    fireEvent.change(screen.getAllByLabelText("Valor")[0], { target: { value: "150000" } });

    fireEvent.click(screen.getByRole("button", { name: "Salvar proposta + versões" }));
    const confirmacao = await screen.findByRole("alertdialog");
    expect(confirmacao).toHaveTextContent("Incluir a ativação nos itens?");
    expect(confirmacao).toHaveTextContent(/1\.500,00/);
    fireEvent.click(within(confirmacao).getByRole("button", { name: "Salvar proposta e incluir" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(inserts("proposals")[0]).toEqual(expect.objectContaining({ total_value: 3500 }));
    expect(inserts("proposal_items")[0]).toEqual([
      expect.objectContaining({ proposal_id: "prop-nova", name: "Placa LED", quantity: 2, unit_value: 1000, position: 0 }),
      expect.objectContaining({ proposal_id: "prop-nova", name: "Blitz", description: "Na entrada", quantity: 1, unit_value: 1500, position: 1 }),
    ]);
    const versoes = inserts("proposal_versions")[0] as { channel: string; model: string | null; metadata: unknown }[];
    expect(versoes.every((v) => v.model === "anthropic/claude-modelo")).toBe(true);
    expect(versoes.find((v) => v.channel === "concept")?.metadata).toEqual({
      activations: [
        { title: "Blitz", description: "Na entrada", value: 1500, value_source: "manual" },
        { title: "Sampling", description: "Degustação", value: null },
      ],
    });
  });

  it("proposta existente sem ativação marcada: salva só as versões, sem confirmação", async () => {
    const onSaved = vi.fn();
    render(
      <ProposalWizardDialog
        proposta={{ id: "prop-1", organization_id: "org-1", brand: "Marca X", sponsor_id: null, property_id: null, total_value: 0, message: "já tem" }}
        onSaved={onSaved}
      />,
    );
    await gerar();
    fireEvent.click(screen.getByRole("button", { name: "Salvar versões" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(inserts("proposal_items")).toHaveLength(0);
    const versoes = inserts("proposal_versions")[0] as { model: string | null }[];
    expect(versoes).toHaveLength(4);
    expect(versoes.every((v) => v.model === "anthropic/claude-modelo")).toBe(true);
  });

  it("resposta sem modelo grava model nulo, não um nome fixo", async () => {
    const { modelo: _ignorado, ...semModelo } = GERADO;
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: semModelo, error: null } as never);
    const onSaved = vi.fn();
    render(
      <ProposalWizardDialog
        proposta={{ id: "prop-1", organization_id: "org-1", brand: "Marca X", sponsor_id: null, property_id: null, total_value: 0, message: "já tem" }}
        onSaved={onSaved}
      />,
    );
    await gerar();
    fireEvent.click(screen.getByRole("button", { name: "Salvar versões" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const versoes = inserts("proposal_versions")[0] as { model: string | null }[];
    expect(versoes.every((v) => v.model === null)).toBe(true);
  });

  it("quem só lê o funil não vê o assistente (BP-2)", () => {
    organizacao.podeEditar = false;
    render(<ProposalWizardDialog onSaved={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Proposta Inteligente/ })).not.toBeInTheDocument();
  });

  it("recusa da RLS ao salvar vira o aviso de permissão, não a mensagem do Postgres (BP-2)", async () => {
    estado.erroNaProposta = { code: "42501", message: 'new row violates row-level security policy for table "proposals"' };
    const onSaved = vi.fn();
    render(<ProposalWizardDialog onSaved={onSaved} />);
    await gerar();
    fireEvent.click(screen.getByRole("button", { name: "Salvar proposta + versões" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(vi.mocked(toast.error).mock.calls[0][0]).toMatch(/só lê Funil e captação/);
    expect(onSaved).not.toHaveBeenCalled();
    expect(inserts("proposal_versions")).toHaveLength(0);
  });
});
