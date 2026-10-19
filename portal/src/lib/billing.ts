// Cobrança e planos: tipos e regras de apresentação (ADR-0007).
//
// Nada aqui decide acesso ou limite — isso é do banco (`billing_status`,
// gatilhos da 0024). O que existe é a tradução do estado para a tela.

/** Tela de plano e cobrança: a única que abre quando a organização está sem acesso. */
export const BILLING_ROUTE = "/dashboard/plano";

export type SubscriptionStatus = "incompleta" | "trialing" | "ativa" | "inadimplente" | "nao_paga" | "cancelada";
export type InvoiceStatus = "rascunho" | "aberta" | "paga" | "nao_paga" | "cancelada";
export type PaymentMethod = "cartao" | "boleto" | "pix";

export interface BillingPlanSummary {
  id: string;
  name: string;
  price_cents: number | null;
  max_properties: number | null;
  max_users: number | null;
}

/** Retorno de `billing_status(_org_id)`. */
export interface BillingStatus {
  organization_id: string;
  access: boolean;
  /** De onde vem o acesso: assinatura, teste grátis ou liberação provisória do boleto. */
  source: "subscription" | "trial" | "provisional" | "none";
  trial_ends_at: string | null;
  has_customer: boolean;
  /** Prazo, em horas, de uma liberação provisória (`billing_settings`). */
  provisional_access_hours: number;
  provisional_access: { kind: "confianca" | "manual" | "superadmin"; expires_at: string } | null;
  plan: BillingPlanSummary | null;
  subscription: {
    plan_id: string;
    status: SubscriptionStatus;
    payment_method: PaymentMethod | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
  } | null;
  usage: { properties: number; users_active: number; invites_pending: number };
}

export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  incompleta: "Aguardando pagamento",
  trialing: "Ativa",
  ativa: "Ativa",
  inadimplente: "Pagamento em atraso",
  nao_paga: "Não paga",
  cancelada: "Cancelada",
};

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  rascunho: "Rascunho",
  aberta: "Em aberto",
  paga: "Paga",
  nao_paga: "Não paga",
  cancelada: "Cancelada",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cartao: "Cartão",
  boleto: "Boleto",
  pix: "Pix",
};

/** Só owner e admin contratam, trocam ou cancelam — a função confere de novo. */
export function canManageBilling(role: string | null): boolean {
  return role === "owner" || role === "admin";
}

/**
 * Centavos de BRL para texto. Nulo é plano "sob consulta". `compacto` omite
 * os centavos quando o valor é inteiro (R$ 490), como na página pública.
 */
export function formatCents(cents: number | null, compacto = false): string {
  if (cents == null) return "Sob consulta";
  const semCentavos = compacto && cents % 100 === 0;
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: semCentavos ? 0 : 2,
    maximumFractionDigits: semCentavos ? 0 : 2,
  });
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

/** Data e hora no fuso de quem vê — prazos de horas, como a liberação provisória. */
export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Dias inteiros que restam até `fim`, arredondando para cima. Nunca negativo. */
export function daysLeft(fim: string | null, agora: Date = new Date()): number {
  if (!fim) return 0;
  const ms = new Date(fim).getTime() - agora.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

export type StatusTone = "ok" | "warn" | "danger";

/** Classes do selo de status, no mesmo padrão dos selos de contrato. */
export const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  ok: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  warn: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  danger: "bg-rose-500/15 text-rose-700 border-rose-500/30",
};

export interface StatusSummary {
  label: string;
  tone: StatusTone;
  detail: string;
}

/** Resumo do estado da cobrança para o selo da tela de plano. */
export function describeStatus(status: BillingStatus, agora: Date = new Date()): StatusSummary {
  const sub = status.subscription;
  const dias = daysLeft(status.trial_ends_at, agora);
  const textoDias = `${dias} ${dias === 1 ? "dia restante" : "dias restantes"}`;

  if (sub) {
    switch (sub.status) {
      case "ativa":
      case "trialing":
        if (sub.cancel_at_period_end) {
          return {
            label: "Cancelamento agendado",
            tone: "warn",
            detail: `O acesso continua até ${formatDate(sub.current_period_end)}.`,
          };
        }
        return {
          label: "Assinatura ativa",
          tone: "ok",
          detail: sub.current_period_end ? `Próxima cobrança em ${formatDate(sub.current_period_end)}.` : "",
        };
      case "inadimplente":
        return {
          label: "Pagamento em atraso",
          tone: "danger",
          detail: "O Stripe está tentando cobrar de novo. Atualize o pagamento para não perder o acesso.",
        };
      case "incompleta":
        return {
          label: "Aguardando pagamento",
          tone: "warn",
          detail:
            status.source === "trial"
              ? `O boleto leva até 1 dia útil para compensar. Teste grátis: ${textoDias}.`
              : status.source === "provisional" && status.provisional_access
                ? `Acesso liberado provisoriamente até ${formatDateTime(status.provisional_access.expires_at)}, enquanto o boleto compensa.`
                : "O boleto leva até 1 dia útil para compensar. O acesso volta quando o pagamento for confirmado.",
        };
      default:
        break;
    }
  }

  if (status.source === "trial") {
    return {
      label: "Teste grátis",
      tone: dias <= 3 ? "warn" : "ok",
      detail: `${textoDias} — termina em ${formatDate(status.trial_ends_at)}.`,
    };
  }

  if (status.source === "provisional" && status.provisional_access) {
    return {
      label: "Acesso provisório",
      tone: "warn",
      detail: `Liberado até ${formatDateTime(status.provisional_access.expires_at)}.`,
    };
  }

  return {
    label: "Sem plano ativo",
    tone: "danger",
    detail: "O teste grátis acabou e a organização não tem assinatura.",
  };
}

// ─── Erro de limite do plano ─────────────────────────────────────────

export type LimitedResource = "propriedades" | "usuarios" | "sem_plano";

export interface PlanLimitError {
  resource: LimitedResource;
  /** Id do plano mais barato que comporta o uso pretendido, quando houver. */
  suggestedPlanId: string | null;
  message: string;
}

const RECURSOS: LimitedResource[] = ["propriedades", "usuarios", "sem_plano"];

/**
 * Reconhece o erro dos gatilhos de limite (0024): `hint = limite_plano:<recurso>`
 * e o plano sugerido em `details`. Aceita o erro do PostgREST (`message`) e o
 * corpo das Edge Functions (`error`). Outro erro qualquer devolve null.
 */
export function parsePlanLimitError(erro: unknown): PlanLimitError | null {
  if (!erro || typeof erro !== "object") return null;
  const { hint, details, message, error } = erro as {
    hint?: string | null;
    details?: string | null;
    message?: string | null;
    error?: string | null;
  };
  if (!hint || !hint.startsWith("limite_plano:")) return null;

  const resource = hint.slice("limite_plano:".length) as LimitedResource;
  if (!RECURSOS.includes(resource)) return null;

  const sugerido = details?.trim() ? details.trim() : null;
  return {
    resource,
    suggestedPlanId: sugerido,
    message: message || error || "Limite do plano atingido.",
  };
}

/** Mensagem para o usuário, com o caminho do upgrade. */
export function planLimitMessage(erro: PlanLimitError, nomeDoPlanoSugerido?: string | null): string {
  if (erro.resource === "sem_plano") {
    return "O teste grátis acabou e a organização não tem assinatura. Assine um plano em Plano e cobrança para continuar.";
  }
  if (!erro.suggestedPlanId) return `${erro.message} Fale com o time comercial para ampliar o plano.`;
  const nome = nomeDoPlanoSugerido || erro.suggestedPlanId;
  return `${erro.message} O plano ${nome} comporta esse uso — veja em Plano e cobrança.`;
}

/** Uso versus limite. Limite nulo é "sem teto". */
export function usageLabel(uso: number, limite: number | null, unidade: string): string {
  return limite == null ? `${uso} ${unidade} (sem limite)` : `${uso} de ${limite} ${unidade}`;
}

export function usagePercent(uso: number, limite: number | null): number | null {
  if (limite == null || limite <= 0) return null;
  return Math.min(100, Math.round((uso / limite) * 100));
}
