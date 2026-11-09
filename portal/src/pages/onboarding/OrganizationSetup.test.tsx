import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

type Resposta = { data: unknown; error: { message: string } | null };

const membro: { resposta: Resposta } = { resposta: { data: null, error: null } };
const superadmin: { resposta: Resposta } = { resposta: { data: false, error: null } };
// Kit de marca e acesso (billing_status) da etapa de marca.
const kit: { resposta: Resposta } = { resposta: { data: null, error: null } };
const acesso: { resposta: Resposta } = { resposta: { data: { access: true }, error: null } };

vi.mock("@/integrations/supabase/client", () => {
  // Cada tabela responde a sua parte; listas (logos do kit) vêm vazias.
  const consulta = (tabela: string) => {
    const q = {
      select: () => q,
      eq: () => q,
      limit: () => q,
      maybeSingle: () =>
        Promise.resolve(
          tabela === "organization_members"
            ? membro.resposta
            : tabela === "organization_brand_kits"
              ? kit.resposta
              : { data: null, error: null },
        ),
      then: (ok: (r: Resposta) => unknown, falha?: (e: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(ok, falha),
    };
    return q;
  };
  return {
    supabase: {
      from: (tabela: string) => consulta(tabela),
      rpc: (nome: string) =>
        Promise.resolve(
          nome === "is_platform_admin"
            ? superadmin.resposta
            : nome === "billing_status"
              ? acesso.resposta
              : { data: null, error: null },
        ),
      functions: { invoke: vi.fn() },
      auth: { signOut: vi.fn() },
      storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
    },
  };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1", user_metadata: {} }, loading: false }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import OrganizationSetup from "./OrganizationSetup";

// A tela espera a lista de convites pendentes (0041) antes de decidir o
// destino; o rpc do mock devolve nenhum convite.
function abrir() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/onboarding/organizacao"]}>
        <Routes>
          <Route path="/onboarding/organizacao" element={<OrganizationSetup />} />
          <Route path="/admin" element={<p>tela admin</p>} />
          <Route path="/dashboard" element={<p>tela dashboard</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const organizacao = { organization_id: "org-1", role: "owner", organization: { name: "Clube" } };
const kitSalvo = { data: { organization_id: "org-1" }, error: null };

// O `localStorage` do Node mais novo encobre o do jsdom e fica indefinido sem
// `--localstorage-file`; um armazenamento em memória basta para o teste.
const armazenado = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => armazenado.get(k) ?? null,
  setItem: (k: string, v: string) => void armazenado.set(k, v),
  removeItem: (k: string) => void armazenado.delete(k),
  clear: () => armazenado.clear(),
});

beforeEach(() => {
  localStorage.clear();
  membro.resposta = { data: null, error: null };
  superadmin.resposta = { data: false, error: null };
  kit.resposta = kitSalvo;
  acesso.resposta = { data: { access: true }, error: null };
});

describe("OrganizationSetup — destino após o login", () => {
  it("leva o superadmin sem organização para /admin", async () => {
    superadmin.resposta = { data: true, error: null };
    abrir();
    expect(await screen.findByText("tela admin")).toBeInTheDocument();
  });

  it("leva o superadmin que também é membro para /admin e guarda a organização ativa", async () => {
    superadmin.resposta = { data: true, error: null };
    membro.resposta = { data: organizacao, error: null };
    abrir();
    expect(await screen.findByText("tela admin")).toBeInTheDocument();
    expect(localStorage.getItem("active_organization_id")).toBe("org-1");
  });

  it("leva o membro comum para /dashboard", async () => {
    membro.resposta = { data: organizacao, error: null };
    abrir();
    expect(await screen.findByText("tela dashboard")).toBeInTheDocument();
  });

  it("segue o fluxo comum quando a verificação de superadmin falha", async () => {
    superadmin.resposta = { data: null, error: { message: "falhou" } };
    membro.resposta = { data: organizacao, error: null };
    abrir();
    expect(await screen.findByText("tela dashboard")).toBeInTheDocument();
  });
});

describe("OrganizationSetup — etapa de marca", () => {
  it("owner de organização sem kit de marca vê a etapa antes do painel", async () => {
    membro.resposta = { data: organizacao, error: null };
    kit.resposta = { data: null, error: null };
    abrir();
    expect(await screen.findByRole("heading", { name: "Cores e logo da sua organização" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar e continuar" })).toBeEnabled();
  });

  it("pular leva ao painel e não volta para a mesma organização", async () => {
    membro.resposta = { data: organizacao, error: null };
    kit.resposta = { data: null, error: null };
    const { unmount } = abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Pular por agora" }));
    expect(await screen.findByText("tela dashboard")).toBeInTheDocument();
    unmount();

    abrir();
    expect(await screen.findByText("tela dashboard")).toBeInTheDocument();
  });

  it("organização sem acesso (cobrança bloqueada) não passa pela etapa", async () => {
    membro.resposta = { data: organizacao, error: null };
    kit.resposta = { data: null, error: null };
    acesso.resposta = { data: { access: false }, error: null };
    abrir();
    expect(await screen.findByText("tela dashboard")).toBeInTheDocument();
  });

  it("papel que não grava o kit vai direto ao painel", async () => {
    membro.resposta = { data: { ...organizacao, role: "comercial" }, error: null };
    kit.resposta = { data: null, error: null };
    abrir();
    expect(await screen.findByText("tela dashboard")).toBeInTheDocument();
  });

  it("erro ao consultar o kit não segura o login", async () => {
    membro.resposta = { data: organizacao, error: null };
    kit.resposta = { data: null, error: { message: "falhou" } };
    abrir();
    expect(await screen.findByText("tela dashboard")).toBeInTheDocument();
  });
});
