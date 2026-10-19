import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpc = vi.fn();
const invoke = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false }),
}));

import { AdminActionError, useGrantAccess, useIsPlatformAdmin, useSavePlan } from "./usePlatformAdmin";

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  rpc.mockReset();
  invoke.mockReset();
});

describe("useIsPlatformAdmin", () => {
  it("é superadmin só quando o banco responde true", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const { result } = renderHook(() => useIsPlatformAdmin(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isPlatformAdmin).toBe(true);
    expect(rpc).toHaveBeenCalledWith("is_platform_admin");
  });

  it("erro na consulta não vira acesso", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "falhou" } });
    const { result } = renderHook(() => useIsPlatformAdmin(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.isPlatformAdmin).toBe(false);
  });
});

describe("useSavePlan", () => {
  it("manda a alteração com plan_id e só os campos recebidos", async () => {
    invoke.mockResolvedValue({ data: { plan: { id: "pro" }, stripe: { status: "sincronizado" } }, error: null });
    const { result } = renderHook(() => useSavePlan(), { wrapper: wrapper() });
    await act(() => result.current.mutateAsync({ action: "update", planId: "pro", plan: { price_cents: 159000 }, comment: "reajuste" }));
    expect(invoke).toHaveBeenCalledWith("admin-plans", {
      body: { action: "update", plan_id: "pro", plan: { price_cents: 159000 }, comment: "reajuste" },
    });
  });

  it("propaga mensagem e code do erro da função", async () => {
    invoke.mockResolvedValue({ data: { error: "Este é o plano do teste grátis.", code: "plano_do_teste" }, error: null });
    const { result } = renderHook(() => useSavePlan(), { wrapper: wrapper() });
    let erro: unknown;
    await act(async () => {
      try {
        await result.current.mutateAsync({ action: "update", planId: "pro", plan: { active: false } });
      } catch (e) {
        erro = e;
      }
    });
    expect(erro).toBeInstanceOf(AdminActionError);
    expect((erro as AdminActionError).code).toBe("plano_do_teste");
    expect((erro as AdminActionError).message).toBe("Este é o plano do teste grátis.");
  });
});

describe("useGrantAccess", () => {
  it("chama a função do banco com a organização da tela, horas e motivo", async () => {
    rpc.mockResolvedValue({ data: { id: "g1", expires_at: "2026-10-18T12:00:00Z" }, error: null });
    const { result } = renderHook(() => useGrantAccess("org-1"), { wrapper: wrapper() });
    const r = await act(() => result.current.mutateAsync({ hours: 48, comment: "Boleto pago" }));
    expect(rpc).toHaveBeenCalledWith("admin_liberar_acesso", { _org_id: "org-1", _horas: 48, _comentario: "Boleto pago" });
    expect(r.expires_at).toBe("2026-10-18T12:00:00Z");
  });

  it("recusa do banco vira erro com a mensagem dele", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Acesso restrito ao superadmin da plataforma.", code: "42501" } });
    const { result } = renderHook(() => useGrantAccess("org-1"), { wrapper: wrapper() });
    await expect(
      act(() => result.current.mutateAsync({ hours: 48, comment: "x" })),
    ).rejects.toThrow("Acesso restrito ao superadmin da plataforma.");
  });
});
