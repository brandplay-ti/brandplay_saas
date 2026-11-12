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

import {
  AdminActionError,
  useAddSupport,
  useGrantAccess,
  usePlatformRole,
  useSavePlan,
  useSettleInvoice,
} from "./usePlatformAdmin";

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  rpc.mockReset();
  invoke.mockReset();
});

describe("usePlatformRole", () => {
  it("superadmin é admin e equipe", async () => {
    rpc.mockResolvedValue({ data: "superadmin", error: null });
    const { result } = renderHook(() => usePlatformRole(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ role: "superadmin", isPlatformAdmin: true, isPlatformStaff: true });
    expect(rpc).toHaveBeenCalledWith("platform_role");
  });

  it("suporte é equipe, mas não superadmin", async () => {
    rpc.mockResolvedValue({ data: "suporte", error: null });
    const { result } = renderHook(() => usePlatformRole(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ role: "suporte", isPlatformAdmin: false, isPlatformStaff: true });
  });

  it("valor desconhecido ou erro não vira acesso", async () => {
    rpc.mockResolvedValue({ data: "owner", error: null });
    const desconhecido = renderHook(() => usePlatformRole(), { wrapper: wrapper() });
    await waitFor(() => expect(desconhecido.result.current.loading).toBe(false));
    expect(desconhecido.result.current).toMatchObject({ role: null, isPlatformStaff: false });

    rpc.mockResolvedValue({ data: null, error: { message: "falhou" } });
    const { result } = renderHook(() => usePlatformRole(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.isPlatformAdmin).toBe(false);
    expect(result.current.isPlatformStaff).toBe(false);
  });
});

describe("useSettleInvoice", () => {
  it("manda a fatura e o motivo para admin-invoices", async () => {
    invoke.mockResolvedValue({ data: { id: "f1", resultado: "baixada" }, error: null });
    const { result } = renderHook(() => useSettleInvoice("org-1"), { wrapper: wrapper() });
    const r = await act(() => result.current.mutateAsync({ invoiceId: "f1", comment: "Pix direto" }));
    expect(invoke).toHaveBeenCalledWith("admin-invoices", {
      body: { action: "settle", invoice_id: "f1", comment: "Pix direto" },
    });
    expect(r.resultado).toBe("baixada");
  });

  it("propaga a mensagem da função", async () => {
    invoke.mockResolvedValue({ data: { error: "Só fatura em aberto recebe baixa." }, error: null });
    const { result } = renderHook(() => useSettleInvoice("org-1"), { wrapper: wrapper() });
    await expect(result.current.mutateAsync({ invoiceId: "f1", comment: "Pix" })).rejects.toThrow(
      "Só fatura em aberto recebe baixa.",
    );
  });
});

describe("useAddSupport", () => {
  it("manda os campos com os nomes da Edge Function", async () => {
    invoke.mockResolvedValue({ data: { user_id: "u2", conta: "nova" }, error: null });
    const { result } = renderHook(() => useAddSupport(), { wrapper: wrapper() });
    await act(() =>
      result.current.mutateAsync({ email: "p@x.com", fullName: "Pessoa", password: "senha-temp", comment: "Atendimento" }),
    );
    expect(invoke).toHaveBeenCalledWith("admin-team", {
      body: { action: "add", email: "p@x.com", full_name: "Pessoa", password: "senha-temp", comment: "Atendimento" },
    });
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
