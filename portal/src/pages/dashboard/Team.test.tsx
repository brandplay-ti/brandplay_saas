import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/integrations/supabase/client", () => {
  function tabela() {
    const resultado = { data: [], error: null };
    const api: {
      select: () => typeof api;
      eq: () => typeof api;
      order: () => typeof api;
      in: () => typeof api;
      update: () => typeof api;
      then: (resolve: (value: typeof resultado) => void, reject?: (reason: unknown) => void) => Promise<void>;
    } = {
      select: () => api,
      eq: () => api,
      order: () => api,
      in: () => api,
      update: () => api,
      then: (resolve, reject) => Promise.resolve(resultado).then(resolve, reject),
    };
    return api;
  }
  return { supabase: { from: () => tabela(), functions: { invoke: vi.fn() } } };
});

vi.mock("@/hooks/useOrganization", () => ({
  useOrganization: () => ({
    orgId: "org-1",
    role: "owner",
    isAdmin: true,
    loading: false,
    refresh: vi.fn(),
  }),
}));

vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }));
vi.mock("@/hooks/usePlanLimitNotice", () => ({ usePlanLimitNotice: () => () => false }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import Team from "./Team";

function tela() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const envoltorio = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<Team />, { wrapper: envoltorio });
}

describe("Usuários e permissões", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("começa em leitura e só mostra seletores depois de editar", async () => {
    tela();

    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Salvar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Permissões/ }));
    await waitFor(() => expect(screen.getAllByText("Sem acesso").length).toBeGreaterThan(0));
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByRole("button", { name: "Salvar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("combobox").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
