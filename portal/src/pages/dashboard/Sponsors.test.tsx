import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const estado = vi.hoisted(() => ({ podeEditar: true, isAdmin: false }));

vi.mock("@/integrations/supabase/client", () => {
  function tabela(nome: string) {
    const resultado = {
      data: nome === "sponsors"
        ? [{ id: "sp-1", name: "Marca Azul", trade_name: null, segment: "Bebidas", logo_path: null, website: null, lifecycle: "cliente", priority: "A", health: "saudavel", account_owner_id: null, last_contact_at: null, next_action: null, next_action_at: null, archived_at: null, tags: null }]
        : [],
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
          return () => consulta;
        },
      },
    );
    return consulta;
  }
  return {
    supabase: {
      from: (nome: string) => tabela(nome),
      rpc: vi.fn(),
      storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
    },
  };
});

vi.mock("@/lib/profileNames", () => ({ withProfileNames: (l: unknown[]) => Promise.resolve(l) }));
vi.mock("@/hooks/useOrganization", () => ({
  useOrganization: () => ({
    orgId: "org-1",
    clientType: "agencia",
    isAdmin: estado.isAdmin,
    can: () => true,
    canWrite: () => estado.podeEditar,
  }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// O `localStorage` do Node mais novo encobre o do jsdom (como em useFiltroSalvo.test).
const armazenado = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => armazenado.get(k) ?? null,
  setItem: (k: string, v: string) => void armazenado.set(k, v),
  removeItem: (k: string) => void armazenado.delete(k),
  clear: () => armazenado.clear(),
});

import Sponsors from "./Sponsors";

const tela = () => render(<MemoryRouter><Sponsors /></MemoryRouter>);

describe("Patrocinadores — somente leitura (BP-29)", () => {
  beforeEach(() => {
    armazenado.clear();
    estado.podeEditar = true;
    estado.isAdmin = false;
  });

  it("quem só lê o CRM vê as contas, sem nova conta nem seleção em lote, e com o aviso", async () => {
    estado.podeEditar = false;
    tela();
    expect(await screen.findByText("Marca Azul")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Somente leitura");
    expect(screen.queryByRole("button", { name: /Nova conta/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Selecionar Marca Azul" })).not.toBeInTheDocument();
  });

  it("admin com o CRM só leitura ainda seleciona, para arquivar e mesclar pela RPC", async () => {
    estado.podeEditar = false;
    estado.isAdmin = true;
    tela();
    expect(await screen.findByRole("checkbox", { name: "Selecionar Marca Azul" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Nova conta/ })).not.toBeInTheDocument();
  });

  it("quem edita o CRM cria conta e seleciona em lote", async () => {
    tela();
    expect(await screen.findByRole("checkbox", { name: "Selecionar Marca Azul" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Nova conta/ })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
