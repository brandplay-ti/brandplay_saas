import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { readEdgeFunctionError } from "@/lib/edgeFunctionError";
import type { AdminIaCliente, AdminIaPadrao, AdminIaPreco, IaFornecedor } from "@/lib/adminAi";
import { AdminActionError } from "@/hooks/usePlatformAdmin";

export const adminAiKeys = {
  all: ["admin", "ia"] as const,
  padrao: ["admin", "ia", "padrao"] as const,
  clientes: ["admin", "ia", "clientes"] as const,
  cliente: (orgId: string | null) => ["admin", "ia", "cliente", orgId] as const,
  consumo: (meses: number) => ["admin", "ia", "consumo", meses] as const,
  precos: ["admin", "ia", "precos"] as const,
};

async function invokeAdminAi<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-ai", { body });
  if (error || (data && typeof data === "object" && "error" in data)) {
    const corpo = await readEdgeFunctionError(error, data);
    throw new AdminActionError(corpo.error ?? "Não foi possível concluir a operação.", corpo.code);
  }
  return data as T;
}

export function useAdminIaPadrao() {
  return useQuery({
    queryKey: adminAiKeys.padrao,
    staleTime: 30_000,
    queryFn: async (): Promise<AdminIaPadrao | null> => {
      const { data, error } = await supabase.rpc("admin_ia_padrao");
      if (error) throw error;
      const rows = (data ?? []) as AdminIaPadrao[];
      return rows[0] ?? null;
    },
  });
}

export function useAdminIaClientes() {
  return useQuery({
    queryKey: adminAiKeys.clientes,
    staleTime: 30_000,
    queryFn: async (): Promise<AdminIaCliente[]> => {
      const { data, error } = await supabase.rpc("admin_ia_clientes");
      if (error) throw error;
      return (data ?? []) as AdminIaCliente[];
    },
  });
}

export function useAdminIaClienteDetalhe(orgId: string | null) {
  return useQuery({
    queryKey: adminAiKeys.cliente(orgId),
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_ia_cliente_detalhe", { _org_id: orgId! });
      if (error) throw error;
      return (data ?? null) as Record<string, unknown> | null;
    },
  });
}

export function useAdminIaPrecos() {
  return useQuery({
    queryKey: adminAiKeys.precos,
    staleTime: 60_000,
    queryFn: async (): Promise<AdminIaPreco[]> => {
      const { data, error } = await supabase.rpc("admin_ia_precos");
      if (error) throw error;
      return (data ?? []) as AdminIaPreco[];
    },
  });
}

export type AdminAiActionInput =
  | {
      action: "testar";
      provider: IaFornecedor;
      api_key: string;
      model_rapido?: string;
      model_padrao?: string;
      model_visao?: string | null;
    }
  | {
      action: "definir_padrao" | "definir_cliente";
      provider: IaFornecedor;
      api_key: string;
      model_rapido?: string;
      model_padrao?: string;
      model_visao?: string | null;
      organization_id?: string;
      comment: string;
    }
  | { action: "revogar_cliente"; organization_id: string; comment: string }
  | {
      action: "configurar_cliente";
      organization_id: string;
      ai_enabled?: boolean;
      monthly_budget_cents?: number | null;
      alert_threshold_pct?: number;
      hard_limit?: boolean | null;
      comment: string;
    }
  | {
      action: "definir_preco";
      provider: IaFornecedor;
      model: string;
      input_brl_per_mtok: number;
      output_brl_per_mtok: number;
      cached_input_brl_per_mtok?: number | null;
      cache_write_input_brl_per_mtok?: number | null;
      valid_from?: string;
      comment: string;
    };

function invalidarAposEscrita(queryClient: ReturnType<typeof useQueryClient>, orgId?: string) {
  queryClient.invalidateQueries({ queryKey: adminAiKeys.padrao });
  queryClient.invalidateQueries({ queryKey: adminAiKeys.clientes });
  queryClient.invalidateQueries({ queryKey: adminAiKeys.precos });
  if (orgId) queryClient.invalidateQueries({ queryKey: adminAiKeys.cliente(orgId) });
}

/** Escrita na Edge Function `admin-ai` (credenciais, configuração, preços). */
export function useAdminAiAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminAiActionInput) => invokeAdminAi<unknown>(input),
    onSettled: (_d, _e, vars) => {
      const orgId = "organization_id" in vars ? vars.organization_id : undefined;
      invalidarAposEscrita(queryClient, orgId);
    },
  });
}
