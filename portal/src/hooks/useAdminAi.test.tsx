import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { adminAiKeys, useAdminIaPadrao } from "@/hooks/useAdminAi";

const rpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    functions: { invoke: vi.fn() },
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useAdminIaPadrao", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it("retorna null quando não há chave padrão no banco", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useAdminIaPadrao(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(rpc).toHaveBeenCalledWith("admin_ia_padrao");
  });
});

describe("adminAiKeys", () => {
  it("monta chave de cliente", () => {
    expect(adminAiKeys.cliente("abc")).toEqual(["admin", "ia", "cliente", "abc"]);
  });
});
