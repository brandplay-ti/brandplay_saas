import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Supabase falso: devolve as linhas da tabela pedida e registra os filtros.
const filtros: Array<[string, string, unknown]> = [];
let linhas: Record<string, unknown[]> = {};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabela: string) => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = (coluna: string, valor: unknown) => {
        filtros.push([tabela, coluna, valor]);
        return q;
      };
      q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: linhas[tabela] ?? [], error: null }).then(ok);
      return q;
    },
  },
}));

import { StorageUsageCard } from "./StorageUsageCard";

const ORG = "a7000000-0000-4000-8000-000000000001";

function montar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return render(<StorageUsageCard orgId={ORG} />, { wrapper: Wrapper });
}

beforeEach(() => {
  filtros.length = 0;
  linhas = {};
});

describe("StorageUsageCard", () => {
  it("sem material, mostra zero e o que vai acontecer", async () => {
    montar();
    expect(await screen.findByText("0 B")).toBeInTheDocument();
    expect(screen.getByText(/Nenhum vídeo ou foto guardado ainda/)).toBeInTheDocument();
    expect(filtros).toEqual([["edition_storage_usage", "organization_id", ORG]]);
  });

  it("mostra o total e a divisão por projeto e edição", async () => {
    linhas = {
      edition_storage_usage: [
        { property_id: "copa26", total_bytes: 40_000_000_000, object_count: 30 },
        { property_id: "copa30", total_bytes: 2_000_000_000, object_count: 1 },
      ],
      sports_properties: [
        { id: "copa", name: "Copa do Mundo", parent_property_id: null },
        { id: "copa26", name: "Copa 2026", parent_property_id: "copa" },
        { id: "copa30", name: "Copa 2030", parent_property_id: "copa" },
      ],
    };
    montar();
    expect(await screen.findByText("42,0 GB", { selector: "h3" })).toBeInTheDocument();
    expect(screen.getByText(/31 arquivos guardados/)).toBeInTheDocument();

    const projetos = screen.getByRole("list", { name: "Uso por projeto" });
    expect(within(projetos).getByText("Copa do Mundo")).toBeInTheDocument();
    const edicoes = screen.getByRole("list", { name: "Edições de Copa do Mundo" });
    expect(within(edicoes).getByText("Copa 2026")).toBeInTheDocument();
    expect(within(edicoes).getByText("40,0 GB · 30 arquivos")).toBeInTheDocument();
    expect(within(edicoes).getByText("2,0 GB · 1 arquivo")).toBeInTheDocument();
    expect(filtros).toContainEqual(["sports_properties", "organization_id", ORG]);
  });
});
