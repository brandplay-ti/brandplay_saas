import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { billingKeys } from "@/hooks/useBilling";
import { readEdgeFunctionError } from "@/lib/edgeFunctionError";
import type {
  AdminClient,
  AdminClientDetail,
  AdminClientType,
  AdminTeamMember,
  NovoSuporte,
  PlatformRole,
  RevenueMonth,
  RevenueProjection,
  StripeSyncStatus,
} from "@/lib/platformAdmin";

// Área administrativa da plataforma (ADR-0008). Os dados vêm das funções
// `admin_*` (0028/0029/0046), que recusam no banco quem não tem o papel, e das
// Edge Functions `admin-plans`, `admin-discounts`, `admin-invoices` e
// `admin-team`. Este hook não é fronteira de segurança.

export type BillingPlan = Tables<"billing_plans">;

export const adminKeys = {
  all: ["admin"] as const,
  role: (userId: string | null) => ["admin", "role", userId] as const,
  team: ["admin", "team"] as const,
  clients: ["admin", "clients"] as const,
  client: (orgId: string | null) => ["admin", "client", orgId] as const,
  clientType: (orgId: string | null) => ["admin", "client", orgId, "client-type"] as const,
  revenue: (months: number) => ["admin", "revenue", months] as const,
  projection: (months: number) => ["admin", "projection", months] as const,
  plans: ["admin", "plans"] as const,
};

/**
 * Papel do usuário logado na equipe da plataforma (RPC `platform_role`, 0046):
 * `superadmin`, `suporte` ou nenhum. `isPlatformAdmin` é só o superadmin;
 * `isPlatformStaff`, qualquer um dos dois.
 */
export function usePlatformRole() {
  const { user, loading } = useAuth();
  const userId = user?.id ?? null;
  const query = useQuery({
    queryKey: adminKeys.role(userId),
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PlatformRole | null> => {
      const { data, error } = await supabase.rpc("platform_role");
      if (error) throw error;
      return data === "superadmin" || data === "suporte" ? data : null;
    },
  });
  const role = query.data ?? null;
  return {
    role,
    isPlatformAdmin: role === "superadmin",
    isPlatformStaff: role !== null,
    loading: loading || (!!userId && query.isLoading),
    error: query.error,
  };
}

/** Organizações com estado de cobrança e uso (`admin_clientes`). */
export function useAdminClients(enabled = true) {
  return useQuery({
    queryKey: adminKeys.clients,
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<AdminClient[]> => {
      const [{ data, error }, tipos] = await Promise.all([
        supabase.rpc("admin_clientes"),
        supabase.rpc("admin_tipos_de_cliente"),
      ]);
      if (error) throw error;
      if (tipos.error) throw tipos.error;
      const tipoPorOrg = new Map((tipos.data ?? []).map((t) => [t.organization_id, t.client_type]));
      // `access_source`, `subscription_status` e `payment_method` chegam como
      // texto no tipo gerado; os valores possíveis estão fixados na 0028.
      return ((data ?? []) as AdminClient[]).map((c) => ({
        ...c,
        client_type: tipoPorOrg.get(c.organization_id) === "marca" ? "marca" : "agencia",
      }));
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

/** Tipo de cliente e o que fica oculto ao virar marca (`admin_tipo_de_cliente`, 0043). */
export function useAdminClientType(orgId: string | null) {
  return useQuery({
    queryKey: adminKeys.clientType(orgId),
    enabled: !!orgId,
    queryFn: async (): Promise<AdminClientType | null> => {
      const { data, error } = await supabase.rpc("admin_tipo_de_cliente", { _org_id: orgId! });
      if (error) throw error;
      // jsonb: o formato está fixado na 0043.
      return (data ?? null) as unknown as AdminClientType | null;
    },
  });
}

/** Troca o tipo de cliente, com motivo e auditoria (`admin_alterar_tipo_de_cliente`). */
export function useChangeClientType(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientType, comment }: { clientType: "agencia" | "marca"; comment: string }) => {
      const { error } = await supabase.rpc("admin_alterar_tipo_de_cliente", {
        _org_id: orgId,
        _tipo: clientType,
        _comentario: comment,
      });
      if (error) throw new AdminActionError(error.message, error.code);
    },
    onSettled: () => invalidarCliente(queryClient, orgId),
  });
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

export type BillingDiscount = Tables<"billing_discounts">;

export function useOrgDiscounts(orgId: string) {
  return useQuery({
    queryKey: ["admin", "discounts", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_discounts")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw new AdminActionError(error.message, error.code);
      return data;
    },
  });
}

async function erroDaFuncao(error: unknown, data: unknown): Promise<never> {
  const corpo = await readEdgeFunctionError(error, data);
  throw new Error(corpo.error ?? "Não foi possível concluir a ação.");
}

/** Cupom de 1–100% por 1–12 meses (`admin-discounts`). 100% isenta no prazo. */
export function useApplyDiscount(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      percentOff,
      durationMonths,
      comment,
    }: {
      percentOff: number;
      durationMonths: number;
      comment: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("admin-discounts", {
        body: {
          action: "apply",
          organization_id: orgId,
          percent_off: percentOff,
          duration_months: durationMonths,
          comment,
        },
      });
      if (error || (data && typeof data === "object" && "error" in data)) await erroDaFuncao(error, data);
      return data as { id: string; stripe_status: string; stripe?: { status: string } };
    },
    onSettled: () => {
      invalidarCliente(queryClient, orgId);
      queryClient.invalidateQueries({ queryKey: ["admin", "discounts", orgId] });
    },
  });
}

export function useRevokeDiscount(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ discountId, comment }: { discountId: string; comment: string }) => {
      const { data, error } = await supabase.functions.invoke("admin-discounts", {
        body: { action: "revoke", discount_id: discountId, comment },
      });
      if (error || (data && typeof data === "object" && "error" in data)) await erroDaFuncao(error, data);
      return data as { id: string; stripe_status: string };
    },
    onSettled: () => {
      invalidarCliente(queryClient, orgId);
      queryClient.invalidateQueries({ queryKey: ["admin", "discounts", orgId] });
    },
  });
}

/** Abre a sessão em que o superadmin vê a organização como admin (1–8 h). */
export function useOpenSupportSession(orgId: string) {
  return useMutation({
    mutationFn: async ({ hours, comment }: { hours: number; comment: string }) => {
      const { data, error } = await supabase.rpc("admin_abrir_sessao_suporte", {
        _org_id: orgId,
        _horas: hours,
        _comentario: comment,
      });
      if (error) throw new AdminActionError(error.message, error.code);
      return data as unknown as { id: string; organization_id: string; expires_at: string };
    },
  });
}

/** Baixa manual de fatura em aberto: quitada no Stripe fora dele (`admin-invoices`). */
export function useSettleInvoice(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ invoiceId, comment }: { invoiceId: string; comment: string }) => {
      const { data, error } = await supabase.functions.invoke("admin-invoices", {
        body: { action: "settle", invoice_id: invoiceId, comment },
      });
      if (error || (data && typeof data === "object" && "error" in data)) await erroDaFuncao(error, data);
      return data as { id: string; resultado: "baixada" | "ja_paga" };
    },
    onSettled: () => invalidarCliente(queryClient, orgId),
  });
}

/** Equipe da plataforma: superadmin e suporte, ativos e revogados (`admin_equipe`). */
export function useAdminTeam() {
  return useQuery({
    queryKey: adminKeys.team,
    queryFn: async (): Promise<AdminTeamMember[]> => {
      const { data, error } = await supabase.rpc("admin_equipe");
      if (error) throw error;
      // `role` chega como texto no tipo gerado; os valores estão fixados na 0046.
      return (data ?? []) as AdminTeamMember[];
    },
  });
}

/** Cadastra Suporte: cria a conta, se não existe, e concede o perfil (`admin-team`). */
export function useAddSupport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: NovoSuporte) => {
      const { data, error } = await supabase.functions.invoke("admin-team", {
        body: {
          action: "add",
          email: input.email,
          full_name: input.fullName,
          password: input.password,
          comment: input.comment,
        },
      });
      if (error || (data && typeof data === "object" && "error" in data)) await erroDaFuncao(error, data);
      return data as { user_id: string; conta: "nova" | "existente" };
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminKeys.team }),
  });
}

/** Reativa o Suporte de uma conta que já foi da equipe (`admin_equipe_conceder_suporte`). */
export function useReactivateSupport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, comment }: { email: string; comment: string }) => {
      const { error } = await supabase.rpc("admin_equipe_conceder_suporte", { _email: email, _comentario: comment });
      if (error) throw new AdminActionError(error.message, error.code);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminKeys.team }),
  });
}

/** Revoga o Suporte; superadmin só sai pelo banco (`admin_equipe_revogar_suporte`). */
export function useRevokeSupport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, comment }: { userId: string; comment: string }) => {
      const { error } = await supabase.rpc("admin_equipe_revogar_suporte", { _user_id: userId, _comentario: comment });
      if (error) throw new AdminActionError(error.message, error.code);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminKeys.team }),
  });
}

// ─── Seletor de cliente (BP-4) ───────────────────────────────────────
// Escolher um cliente no menu abre na hora uma sessão de suporte (0035) com
// prazo e motivo fixos, como no central-check; voltar à visão de admin a
// encerra. A sessão continua auditada e expira sozinha.

export const HORAS_DO_SELETOR = 8;
export const MOTIVO_DO_SELETOR = "Seleção de cliente no menu";
export const MOTIVO_DA_VOLTA = "Voltou à visão de admin pelo menu";

export interface ActiveSupportSession {
  id: string;
  organization_id: string;
  organization_name: string;
  expires_at: string;
}

/** Sessão de suporte aberta de quem está logado (`admin_sessao_suporte_ativa`), ou nula. */
export function useActiveSupportSession(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["admin", "support-session", user?.id ?? null],
    enabled: enabled && !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<ActiveSupportSession | null> => {
      const { data, error } = await supabase.rpc("admin_sessao_suporte_ativa");
      if (error) throw error;
      // jsonb: o formato está fixado na 0035.
      return (data ?? null) as unknown as ActiveSupportSession | null;
    },
  });
}

/** Entra no painel do cliente: sessão de suporte de 8 h com o motivo do seletor. */
export function useEnterClient() {
  return useMutation({
    mutationFn: async (orgId: string) => {
      const { data, error } = await supabase.rpc("admin_abrir_sessao_suporte", {
        _org_id: orgId,
        _horas: HORAS_DO_SELETOR,
        _comentario: MOTIVO_DO_SELETOR,
      });
      if (error) throw new AdminActionError(error.message, error.code);
      return data as unknown as { id: string; organization_id: string; expires_at: string };
    },
  });
}

/** Volta à visão de admin: encerra a sessão de suporte aberta. */
export function useLeaveClient() {
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase.rpc("admin_encerrar_sessao_suporte", {
        _sessao_id: sessionId,
        _comentario: MOTIVO_DA_VOLTA,
      });
      if (error) throw new AdminActionError(error.message, error.code);
    },
  });
}
