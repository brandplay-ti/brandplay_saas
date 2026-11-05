import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

type Resposta = { data: unknown; error: { message: string } | null };

const membro: { resposta: Resposta } = { resposta: { data: null, error: null } };
const superadmin: { resposta: Resposta } = { resposta: { data: false, error: null } };

vi.mock("@/integrations/supabase/client", () => {
  const consulta = {
    select: () => consulta,
    eq: () => consulta,
    limit: () => consulta,
    maybeSingle: () => Promise.resolve(membro.resposta),
  };
  return {
    supabase: {
      from: () => consulta,
      rpc: (nome: string) =>
        Promise.resolve(nome === "is_platform_admin" ? superadmin.resposta : { data: null, error: null }),
      functions: { invoke: vi.fn() },
      auth: { signOut: vi.fn() },
    },
  };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1", user_metadata: {} }, loading: false }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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
