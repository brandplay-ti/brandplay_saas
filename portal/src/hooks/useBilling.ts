import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { BillingStatus } from "@/lib/billing";
import { readEdgeFunctionError } from "@/lib/edgeFunctionError";

export type BillingPlan = Tables<"billing_plans">;
export type BillingInvoice = Tables<"billing_invoices">;
export type BillingSettings = Tables<"billing_settings">;

export type BillingAction =
  | "checkout"
  | "change_plan"
  | "cancel"
  | "resume"
  | "portal"
  | "sync"
  | "pay_pix"
  | "request_provisional_access";

export interface BillingActionInput {
  action: BillingAction;
  planId?: string;
  invoiceId?: string;
  receiptPath?: string;
  confirmPaid?: boolean;
}

export const billingKeys = {
  all: ["billing"] as const,
  status: (orgId: string | null) => ["billing", "status", orgId] as const,
  plans: ["billing", "plans"] as const,
  settings: ["billing", "settings"] as const,
  invoices: (orgId: string | null) => ["billing", "invoices", orgId] as const,
};

/** Parâmetros públicos de cobrança: duração do teste e prazo da liberação. */
export function useBillingSettings() {
  return useQuery({
    queryKey: billingKeys.settings,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<BillingSettings | null> => {
      const { data, error } = await supabase.from("billing_settings").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Acesso, plano, assinatura e uso da organização (RPC `billing_status`). */
export function useBillingStatus(orgId: string | null) {
  return useQuery({
    queryKey: billingKeys.status(orgId),
    enabled: !!orgId,
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<BillingStatus> => {
      const { data, error } = await supabase.rpc("billing_status", { _org_id: orgId! });
      if (error) throw error;
      // O tipo gerado de uma função que devolve jsonb é `Json`; o formato está
      // fixado na 0024 e espelhado em `BillingStatus`.
      return data as unknown as BillingStatus;
    },
  });
}

/** Catálogo de planos à venda, na ordem de exibição. */
export function useBillingPlans() {
  return useQuery({
    queryKey: billingKeys.plans,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<BillingPlan[]> => {
      const { data, error } = await supabase
        .from("billing_plans")
        .select("*")
        .eq("active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Faturas da organização. A RLS só devolve linhas a owner/admin. */
export function useBillingInvoices(orgId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: billingKeys.invoices(orgId),
    enabled: !!orgId && enabled,
    queryFn: async (): Promise<BillingInvoice[]> => {
      const { data, error } = await supabase
        .from("billing_invoices")
        .select("*")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Erro de uma ação de cobrança, com o `code` que a manage-billing devolve. */
export class BillingActionError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

interface BillingActionResult {
  url?: string;
  ok?: boolean;
  current_period_end?: string | null;
  expires_at?: string;
}

/** Ações da Edge Function `manage-billing` sobre a organização ativa. */
export function useManageBilling(orgId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ action, planId, invoiceId, receiptPath, confirmPaid }: BillingActionInput): Promise<BillingActionResult> => {
      if (!orgId) throw new BillingActionError("Nenhuma organização selecionada.");
      const { data, error } = await supabase.functions.invoke("manage-billing", {
        body: {
          action,
          organization_id: orgId,
          plan_id: planId,
          invoice_id: invoiceId,
          receipt_path: receiptPath,
          confirm_paid: confirmPaid,
        },
      });
      if (error || data?.error) {
        const corpo = await readEdgeFunctionError(error, data);
        throw new BillingActionError(corpo.error ?? "Não foi possível concluir a operação de cobrança.", corpo.code);
      }
      return (data ?? {}) as BillingActionResult;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.status(orgId) });
      queryClient.invalidateQueries({ queryKey: billingKeys.invoices(orgId) });
    },
  });
}
