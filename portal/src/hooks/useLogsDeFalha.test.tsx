import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Consulta encadeável do supabase-js: registra cada filtro e resolve no await.
type Chamada = [string, ...unknown[]];
const chamadas: Chamada[] = [];
let resposta: { data: unknown; error: unknown } = { data: [], error: null };

function consulta(): Record<string, unknown> {
  const q: Record<string, unknown> = {};
  for (const metodo of ["select", "order", "limit", "eq", "is", "ilike"]) {
    q[metodo] = (...args: unknown[]) => {
      chamadas.push([metodo, ...args]);
      return q;
    };
  }
  q.then = (ok: (v: unknown) => unknown, falha: (e: unknown) => unknown) => Promise.resolve(resposta).then(ok, falha);
  return q;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabela: string) => {
      chamadas.push(["from", tabela]);
      return consulta();
    },
  },
}));

import { LIMITE_DE_FALHAS, useFalhasDeBanco, useFalhasDeTela } from "./useLogsDeFalha";

const ORG = "a2000000-0000-4000-8000-000000000001";

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const filtrosDe = (metodo: string) => chamadas.filter(([m]) => m === metodo).map(([, ...args]) => args);

beforeEach(() => {
  chamadas.length = 0;
  resposta = { data: [], error: null };
});

describe("useFalhasDeBanco", () => {
  it("sem filtro busca as mais recentes de todos os clientes", async () => {
    const { result } = renderHook(
      () => useFalhasDeBanco({ cliente: "todos", usuario: "", tabela: "todas", acao: "todas" }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(filtrosDe("from")).toEqual([["backend_error_logs"]]);
    expect(filtrosDe("order")).toEqual([["created_at", { ascending: false }]]);
    expect(filtrosDe("limit")).toEqual([[LIMITE_DE_FALHAS]]);
    expect(filtrosDe("eq")).toEqual([]);
    expect(filtrosDe("is")).toEqual([]);
  });

  it("aplica cliente, tabela, ação e e-mail", async () => {
    const { result } = renderHook(
      () => useFalhasDeBanco({ cliente: ORG, usuario: "maria", tabela: "sponsors", acao: "INSERT" }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(filtrosDe("eq")).toEqual([
      ["organization_id", ORG],
      ["table_name", "sponsors"],
      ["action", "INSERT"],
    ]);
    expect(filtrosDe("ilike")).toEqual([["user_email", "%maria%"]]);
  });

  it("propaga o erro da consulta", async () => {
    resposta = { data: null, error: { message: "permission denied" } };
    const { result } = renderHook(
      () => useFalhasDeBanco({ cliente: "todos", usuario: "", tabela: "todas", acao: "todas" }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useFalhasDeTela", () => {
  it("filtra os registros sem organização, por severidade e por id de usuário", async () => {
    const { result } = renderHook(
      () => useFalhasDeTela({ cliente: "sem-organizacao", usuario: ORG, severidade: "fatal" }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(filtrosDe("from")).toEqual([["error_reports"]]);
    expect(filtrosDe("is")).toEqual([["organization_id", null]]);
    expect(filtrosDe("eq")).toEqual([
      ["severity", "fatal"],
      ["user_id", ORG],
    ]);
  });
});
