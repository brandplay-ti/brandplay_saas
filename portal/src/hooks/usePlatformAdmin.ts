import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { billingKeys } from "@/hooks/useBilling";
import { readEdgeFunctionError } from "@/lib/edgeFunctionError";
import type {
  AdminClient,
  AdminClientDetail,
  RevenueMonth,
  RevenueProjection,
  StripeSyncStatus,
} from "@/lib/platformAdmin";

// Área administrativa da plataforma (ADR-0008). Os dados vêm das funções
// `admin_*` (0028/0029), que recusam no banco quem não é superadmin, e da
// Edge Function `admin-plans`. Este hook não é fronteira de segurança.

export type BillingPlan = Tables<"billing_plans">;

export const adminKeys = {
  all: ["admin"] as const,
  isAdmin: (userId: string | null) => ["admin", "is-admin", userId] as const,
  clients: ["admin", "clients"] as const,
  client: (orgId: string | null) => ["admin", "client", orgId] as const,
  revenue: (months: number) => ["admin", "revenue", months] as const,
  projection: (months: number) => ["admin", "projection", months] as const,
  plans: ["admin", "plans"] as const,
};

/** Se o usuário logado é superadmin ativo (RPC `is_platform_admin`). */
export function useIsPlatformAdmin() {
  const { user, loading } = useAuth();
  const userId = user?.id ?? null;
  const query = useQuery({
    queryKey: adminKeys.isAdmin(userId),
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc("is_platform_admin");
      if (error) throw error;
      return data === true;
    },
  });
  return {
    isPlatformAdmin: query.data === true,
    loading: loading || (!!userId && query.isLoading),
    error: query.error,
  };
}

/** Organizações com estado de cobrança e uso (`admin_clientes`). */
export function useAdminClients() {
  return useQuery({
    queryKey: adminKeys.clients,
    staleTime: 30_000,
    queryFn: async (): Promise<AdminClient[]> => {
      const { data, error } = await supabase.rpc("admin_clientes");
      if (error) throw error;
      // `access_source`, `subscription_status` e `payment_method` chegam como
      // texto no tipo gerado; os valores possíveis estão fixados na 0028.
      return (data ?? []) as AdminClient[];
    },
  });
}

/** Detalhe de uma organização (`admin_cliente_detalhe`). Nulo quando não existe. */
export function useAdminClientDetail(orgId: string | null) {
  return useQuery({
    queryKey: adminKeys.client(orgId),
    enabled: !!orgId,
    queryFn: async (): Promise<AdminClientDetail | null> => {
      const { data, error } = await supabase.rpc("admin_cliente_detalhe", { _org_id: orgId! });
      if (error) throw error;
      // jsonb: o tipo gerado é `Json`; o formato está fixado na 0028.
      return (data ?? null) as unknown as AdminClientDetail | null;
    },
  });
}

/** Receita paga, clientes e movimento mês a mês (`admin_faturamento_realizado`). */
export function useAdminRevenue(months: number) {
  return useQuery({
    queryKey: adminKeys.revenue(months),
    staleTime: 60_000,
    queryFn: async (): Promise<RevenueMonth[]> => {
      const { data, error } = await supabase.rpc("admin_faturamento_realizado", { _meses: months });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** MRR, funil e projeção (`admin_faturamento_projetado`). */
export function useAdminProjection(months: number) {
  return useQuery({
    queryKey: adminKeys.projection(months),
    staleTime: 60_000,
    queryFn: async (): Promise<RevenueProjection> => {
      const { data, error } = await supabase.rpc("admin_faturamento_projetado", { _meses: months });
      if (error) throw error;
      return data as unknown as RevenueProjection;
    },
  });
}

/** Catálogo completo, inclusive planos fora de venda. */
export function useAdminPlans() {
  return useQuery({
    queryKey: adminKeys.plans,
    queryFn: async (): Promise<BillingPlan[]> => {
      const { data, error } = await supabase
        .from("billing_plans")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Erro de uma ação administrativa, com o `code` que a função devolve. */
export class AdminActionError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

export type PlanFields = Pick<
  BillingPlan,
  "name" | "description" | "price_cents" | "max_properties" | "max_users" | "features" | "highlight" | "active" | "sort_order"
>;

export type SavePlanInput =
  | { action: "create"; plan: PlanFields & { id: string }; comment?: string }
  | { action: "update"; planId: string; plan: Partial<PlanFields>; comment?: string }
  | { action: "sync"; planId: string };

export interface SavePlanResult {
  plan: BillingPlan;
  stripe: { status: StripeSyncStatus; message?: string };
}

/** Cria, altera ou sincroniza um plano pela Edge Function `admin-plans`. */
export function useSavePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SavePlanInput): Promise<SavePlanResult> => {
      const body =
        input.action === "create"
          ? { action: "create", plan: input.plan, comment: input.comment }
          : input.action === "update"
            ? { action: "update", plan_id: input.planId, plan: input.plan, comment: input.comment }
            : { action: "sync", plan_id: input.planId };
      const { data, error } = await supabase.functions.invoke("admin-plans", { body });
      if (error || data?.error) {
        const corpo = await readEdgeFunctionError(error, data);
        throw new AdminActionError(corpo.error ?? "Não foi possível salvar o plano.", corpo.code);
      }
      return data as SavePlanResult;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.plans });
      // A página pública e a tela de plano leem o mesmo catálogo.
      queryClient.invalidateQueries({ queryKey: billingKeys.plans });
    },
  });
}

function invalidarCliente(queryClient: ReturnType<typeof useQueryClient>, orgId: string) {
  queryClient.invalidateQueries({ queryKey: adminKeys.client(orgId) });
  queryClient.invalidateQueries({ queryKey: adminKeys.clients });
  queryClient.invalidateQueries({ queryKey: ["admin", "projection"] });
}

/** Liberação provisória pelo superadmin (`admin_liberar_acesso`). */
export function useGrantAccess(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ hours, comment }: { hours: number; comment: string }) => {
      const { data, error } = await supabase.rpc("admin_liberar_acesso", {
        _org_id: orgId,
        _horas: hours,
        _comentario: comment,
      });
      if (error) throw new AdminActionError(error.message, error.code);
      return data as unknown as { id: string; expires_at: string };
    },
    onSettled: () => invalidarCliente(queryClient, orgId),
  });
}

/** Encerra uma liberação vigente (`admin_revogar_liberacao`). */
export function useRevokeGrant(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ grantId, comment }: { grantId: string; comment: string }) => {
      const { error } = await supabase.rpc("admin_revogar_liberacao", { _grant_id: grantId, _comentario: comment });
      if (error) throw new AdminActionError(error.message, error.code);
    },
    onSettled: () => invalidarCliente(queryClient, orgId),
  });
}

/** Soma dias ao teste grátis (`admin_estender_teste`). */
export function useExtendTrial(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ days, comment }: { days: number; comment: string }) => {
      const { data, error } = await supabase.rpc("admin_estender_teste", {
        _org_id: orgId,
        _dias: days,
        _comentario: comment,
      });
      if (error) throw new AdminActionError(error.message, error.code);
      return data as unknown as { trial_ends_at: string };
    },
    onSettled: () => invalidarCliente(queryClient, orgId),
  });
}
