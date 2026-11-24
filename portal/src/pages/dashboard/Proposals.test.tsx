import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { PROPOSTA, ESCRITAS } = vi.hoisted(() => ({ ESCRITAS: [] as { tabela: string; metodo: string; args: unknown[] }[], PROPOSTA: {
  id: "prop-1",
  organization_id: "org-1",
  title: "Proposta Copa Verão · Marca X",
  proposal_number: "42",
  brand: "Marca X",
  sponsor_id: null,
  property_id: null,
  total_value: 10000,
  status: "rascunho",
  valid_until: null,
  message: null,
  pdf_path: null,
  converted_opportunity_id: null,
  converted_contract_id: null,
  created_at: "2026-11-01T00:00:00Z",
} }));

vi.mock("@/integrations/supabase/client", () => {
  // Qualquer encadeamento (.select().eq().order()...) devolve a mesma consulta,
  // que resolve com a lista da tabela.
  function tabela(nome: string) {
    const resultado = { data: nome === "proposals" ? [PROPOSTA] : [], error: null };
    const consulta: Record<string | symbol, unknown> = new Proxy(
      {},
      {
        get: (_alvo, chave) => {
          if (chave === "then") {
            return (resolve: (v: typeof resultado) => void, reject?: (e: unknown) => void) =>
              Promise.resolve(resultado).then(resolve, reject);
          }
          return (...args: unknown[]) => {
            if (chave === "update" || chave === "eq") ESCRITAS.push({ tabela: nome, metodo: String(chave), args });
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
      functions: { invoke: vi.fn(() => Promise.resolve({ data: null, error: null })) },
      auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: "user-1" } } })) },
      storage: { from: () => ({ createSignedUrl: vi.fn() }) },
    },
  };
});

const organizacao = vi.hoisted(() => ({ podeEditar: true }));
vi.mock("@/hooks/useOrganization", () => ({
  useOrganization: () => ({
    orgId: "org-1",
    role: "owner",
    isAdmin: true,
    loading: false,
    refresh: vi.fn(),
    can: () => true,
    canWrite: () => organizacao.podeEditar,
  }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

// O `localStorage` do Node mais novo encobre o do jsdom (como em useFiltroSalvo.test).
const armazenado = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => armazenado.get(k) ?? null,
  setItem: (k: string, v: string) => void armazenado.set(k, v),
  removeItem: (k: string) => void armazenado.delete(k),
  clear: () => armazenado.clear(),
});

import { toast } from "sonner";
import Proposals from "./Proposals";

function Endereco() {
  const { search } = useLocation();
  return <output data-testid="endereco">{search}</output>;
}

function tela(url: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const envoltorio = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return render(
    <Routes>
      <Route
        path="/dashboard/propostas"
        element={
          <>
            <Proposals />
            <Endereco />
          </>
        }
      />
    </Routes>,
    { wrapper: envoltorio },
  );
}

describe("Propostas — link direto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    organizacao.podeEditar = true;
  });

  it("abre a proposta do parâmetro ?proposal e tira o parâmetro da URL", async () => {
    tela("/dashboard/propostas?proposal=prop-1");

    const painel = await screen.findByRole("dialog");
    expect(painel).toHaveTextContent(PROPOSTA.title);
    await waitFor(() => expect(screen.getByTestId("endereco")).toHaveTextContent(""));
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("avisa e não abre nada quando a proposta não está na organização", async () => {
    tela("/dashboard/propostas?proposal=de-outra-org");

    await waitFor(() => expect(toast.info).toHaveBeenCalledWith("Proposta não encontrada nesta organização."));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("endereco")).toHaveTextContent("");
  });

  it("sem parâmetro, só lista", async () => {
    tela("/dashboard/propostas");

    await screen.findAllByText(PROPOSTA.title);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("Propostas — mensagem na aba Info (BP-8)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    ESCRITAS.length = 0;
    organizacao.podeEditar = true;
  });

  it("edita a mensagem de uma proposta sem mensagem e grava ao sair do campo", async () => {
    tela("/dashboard/propostas?proposal=prop-1");
    const painel = await screen.findByRole("dialog");

    // Radix Tabs ativa a aba no mousedown.
    fireEvent.mouseDown(within(painel).getByRole("tab", { name: "Info" }));
    const campo = await within(painel).findByLabelText("Mensagem");
    expect(campo).toHaveValue("");

    fireEvent.change(campo, { target: { value: "Segue a proposta revisada." } });
    fireEvent.blur(campo);

    await waitFor(() =>
      expect(ESCRITAS).toContainEqual({ tabela: "proposals", metodo: "update", args: [{ message: "Segue a proposta revisada." }] }),
    );
    expect(ESCRITAS).toContainEqual({ tabela: "proposals", metodo: "eq", args: ["id", "prop-1"] });
    await waitFor(() => expect(campo).toHaveValue("Segue a proposta revisada."));
  });
});

describe("Propostas — quem só lê o funil (BP-2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    ESCRITAS.length = 0;
    organizacao.podeEditar = false;
  });

  it("lista as propostas sem os botões de criar, enviar ao funil e excluir", async () => {
    tela("/dashboard/propostas");

    await screen.findAllByText(PROPOSTA.title);
    expect(screen.getAllByRole("status").some((el) => el.textContent?.includes("Somente leitura"))).toBe(true);
    for (const nome of [/Nova proposta/, /Proposta Inteligente/, /Gerar com IA/, /^Funil/, /^Excluir/]) {
      expect(screen.queryByRole("button", { name: nome })).not.toBeInTheDocument();
    }
  });

  it("abre a proposta com os campos bloqueados e sem gravar", async () => {
    tela("/dashboard/propostas?proposal=prop-1");
    const painel = await screen.findByRole("dialog");
    expect(within(painel).getByRole("status")).toHaveTextContent("Somente leitura");

    fireEvent.mouseDown(within(painel).getByRole("tab", { name: "Ações" }));
    expect(await within(painel).findByRole("button", { name: /Excluir proposta/ })).toBeDisabled();
    expect(within(painel).getByRole("button", { name: /Enviada/ })).toBeDisabled();
    expect(within(painel).getByRole("button", { name: /Gerar PDF/ })).toBeDisabled();

    fireEvent.mouseDown(within(painel).getByRole("tab", { name: "Info" }));
    expect(await within(painel).findByLabelText("Mensagem")).toBeDisabled();
    expect(ESCRITAS.filter((e) => e.metodo === "update")).toHaveLength(0);
  });
});
