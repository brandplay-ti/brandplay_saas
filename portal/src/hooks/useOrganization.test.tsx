import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { OrganizationProvider, useOrganization } from "@/hooks/useOrganization";

// Usuário em duas organizações, com papéis diferentes em cada uma.
const SCOUT = "00000000-0000-0000-0000-00000000000a";
const KIDS = "00000000-0000-0000-0000-00000000000b";

const membros = [
  { role: "operacional", organization_id: KIDS, organization: { name: "Kids League", logo_path: null, client_type: "agencia" } },
  { role: "admin", organization_id: SCOUT, organization: { name: "Scout", logo_path: null, client_type: "agencia" } },
];

// Matriz padrão da semear_permissoes_da_organizacao (0043), só admin e operacional.
const matriz = (org: string) => [
  ...["crm", "vendas", "operacional", "financeiro", "team"].map((module) => ({ organization_id: org, role: "admin", module, access: "write" })),
  { organization_id: org, role: "operacional", module: "crm", access: "read" },
  { organization_id: org, role: "operacional", module: "vendas", access: "read" },
  { organization_id: org, role: "operacional", module: "operacional", access: "write" },
  { organization_id: org, role: "operacional", module: "financeiro", access: "read" },
  { organization_id: org, role: "operacional", module: "team", access: "none" },
];

/** Encadeamento do PostgREST que termina numa Promise com `resultado`. */
function consulta(resultado: { data: unknown; error: null }) {
  const cadeia: Record<string, unknown> = {};
  for (const metodo of ["select", "eq", "in", "order", "maybeSingle"]) cadeia[metodo] = () => cadeia;
  cadeia.then = (ok: (v: unknown) => unknown) => Promise.resolve(resultado).then(ok);
  return cadeia;
}

// Sessão controlável: no F5 o useAuth começa sem usuário e com loading até ler a sessão.
const auth = vi.hoisted(() => ({ atual: { user: { id: "u1" } as { id: string } | null, loading: false } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth.atual }));
vi.mock("@/lib/backendErrorLogger", () => ({ logBackendDbError: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: () => Promise.resolve({ data: null, error: null }),
    from: (tabela: string) =>
      tabela === "organization_members"
        ? consulta({ data: membros, error: null })
        : consulta({ data: [...matriz(SCOUT), ...matriz(KIDS)], error: null }),
  },
}));

// O `localStorage` do Node mais novo encobre o do jsdom (como em OrganizationSetup.test).
const armazenado = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => armazenado.get(k) ?? null,
  setItem: (k: string, v: string) => void armazenado.set(k, v),
  removeItem: (k: string) => void armazenado.delete(k),
  clear: () => armazenado.clear(),
});

const wrapper = ({ children }: { children: ReactNode }) => <OrganizationProvider>{children}</OrganizationProvider>;

async function ativa(orgId: string | null) {
  if (orgId) localStorage.setItem("active_organization_id", orgId);
  const { result } = renderHook(() => useOrganization(), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result.current;
}

describe("OrganizationProvider com papéis diferentes por organização", () => {
  beforeEach(() => {
    localStorage.clear();
    auth.atual = { user: { id: "u1" }, loading: false };
  });

  it("na organização em que é admin, o menu é o de admin", async () => {
    const org = await ativa(SCOUT);
    expect(org.orgName).toBe("Scout");
    expect(org.role).toBe("admin");
    expect(org.isAdmin).toBe(true);
    expect(org.can("team")).toBe(true);
    expect(org.can("financeiro")).toBe(true);
  });

  it("na organização em que é operacional, o menu é o de operacional", async () => {
    const org = await ativa(KIDS);
    expect(org.orgName).toBe("Kids League");
    expect(org.role).toBe("operacional");
    expect(org.isAdmin).toBe(false);
    expect(org.can("team")).toBe(false);
    expect(org.can("operacional")).toBe(true);
  });

  it("sem organização salva, usa a primeira e o papel dela", async () => {
    const org = await ativa(null);
    expect(org.orgId).toBe(KIDS);
    expect(org.role).toBe("operacional");
    expect(localStorage.getItem("active_organization_id")).toBe(KIDS);
  });

  it("no F5, segue carregando enquanto a sessão não foi lida (o ModuleRoute não redireciona)", async () => {
    localStorage.setItem("active_organization_id", SCOUT);
    auth.atual = { user: null, loading: true };
    const { result, rerender } = renderHook(() => useOrganization(), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.loading).toBe(true);
    expect(result.current.can("vendas")).toBe(false);

    auth.atual = { user: { id: "u1" }, loading: false };
    rerender();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.orgId).toBe(SCOUT);
    expect(result.current.can("vendas")).toBe(true);
  });

  it("sem login, o loading termina sem organização", async () => {
    auth.atual = { user: null, loading: false };
    const { result } = renderHook(() => useOrganization(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.orgId).toBeNull();
  });
});
