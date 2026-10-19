// Área administrativa da plataforma (superadmin, ADR-0008): tipos dos retornos
// das funções `admin_*` (0028/0029) e regras de apresentação.
//
// Nada aqui decide acesso: as funções recusam quem não é superadmin no banco.
// A tela só traduz o que elas devolvem.

import type { BillingStatus, InvoiceStatus, PaymentMethod, StatusTone, SubscriptionStatus } from "@/lib/billing";

export type AccessSource = BillingStatus["source"];

/** Linha de `admin_clientes()`. */
export interface AdminClient {
  organization_id: string;
  name: string;
  created_at: string;
  owner_name: string | null;
  owner_email: string | null;
  access_source: AccessSource;
  plan_id: string | null;
  plan_name: string | null;
  subscription_status: SubscriptionStatus | null;
  payment_method: PaymentMethod | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  provisional_expires_at: string | null;
  mrr_cents: number;
  properties: number;
  users_active: number;
  invites_pending: number;
  open_invoices: number;
  last_paid_at: string | null;
}

export type GrantKind = "confianca" | "manual" | "superadmin";

/** Retorno de `admin_cliente_detalhe(org)`. */
export interface AdminClientDetail {
  organization: {
    id: string;
    name: string;
    legal_name: string | null;
    trade_name: string | null;
    cnpj: string | null;
    email: string | null;
    phone: string | null;
    city: string | null;
    state: string | null;
    created_at: string;
    owner: { id: string; name: string | null; email: string | null } | null;
  };
  billing: {
    access: boolean;
    access_source: AccessSource;
    trial_ends_at: string | null;
    stripe_customer_id: string | null;
    plan: {
      id: string;
      name: string;
      price_cents: number | null;
      max_properties: number | null;
      max_users: number | null;
    } | null;
  };
  usage: { properties: number; users_active: number; invites_pending: number };
  subscriptions: {
    id: string;
    plan_id: string;
    plan_name: string | null;
    status: SubscriptionStatus;
    payment_method: PaymentMethod | null;
    current_period_start: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    canceled_at: string | null;
    stripe_subscription_id: string;
    created_at: string;
  }[];
  invoices: {
    id: string;
    number: string | null;
    status: InvoiceStatus;
    payment_method: PaymentMethod | null;
    amount_cents: number;
    currency: string;
    due_at: string | null;
    paid_at: string | null;
    hosted_invoice_url: string | null;
    invoice_pdf_url: string | null;
    created_at: string;
  }[];
  grants: {
    id: string;
    kind: GrantKind;
    comment: string | null;
    stripe_invoice_id: string | null;
    has_receipt: boolean;
    granted_by_email: string | null;
    expires_at: string;
    revoked_at: string | null;
    active: boolean;
    created_at: string;
  }[];
  audit: AuditEntry[];
}

export interface AuditEntry {
  id: string;
  action: string;
  admin_email: string | null;
  comment: string | null;
  before: unknown;
  after: unknown;
  created_at: string;
}

/** Linha de `admin_faturamento_realizado(meses)`. Valores em centavos. */
export interface RevenueMonth {
  month: string;
  revenue_cents: number;
  paid_invoices: number;
  customers: number;
  new_subscriptions: number;
  cancellations: number;
}

/** Retorno de `admin_faturamento_projetado(meses, historico)`. Valores em centavos. */
export interface RevenueProjection {
  mrr_cents: number;
  customers: number;
  in_trial: number;
  awaiting_payment: number;
  average_ticket_cents: number;
  growth_rate: number;
  churn_rate: number;
  history_months: number;
  months: {
    month: string;
    base_cents: number;
    optimistic_cents: number;
    pessimistic_cents: number;
    customers: number;
  }[];
}

// ─── Rótulos ─────────────────────────────────────────────────────────

export const ACCESS_SOURCE_LABEL: Record<AccessSource, string> = {
  subscription: "Assinante",
  trial: "Em teste",
  provisional: "Liberação provisória",
  none: "Sem acesso",
};

export const ACCESS_SOURCE_TONE: Record<AccessSource, StatusTone> = {
  subscription: "ok",
  trial: "ok",
  provisional: "warn",
  none: "danger",
};

export const GRANT_KIND_LABEL: Record<GrantKind, string> = {
  confianca: "Cliente (comprovante)",
  manual: "Equipe (SQL)",
  superadmin: "Superadmin",
};

const ACAO_DE_AUDITORIA: Record<string, string> = {
  acesso_liberado: "Acesso liberado",
  liberacao_revogada: "Liberação revogada",
  teste_estendido: "Teste estendido",
  plano_criado: "Plano criado",
  plano_alterado: "Plano alterado",
  plano_sincronizado: "Plano sincronizado com o Stripe",
  superadmin_concedido: "Superadmin concedido",
  superadmin_revogado: "Superadmin revogado",
};

export function auditActionLabel(acao: string): string {
  return ACAO_DE_AUDITORIA[acao] ?? acao;
}

// ─── Lista de clientes ───────────────────────────────────────────────

export interface ClientFilters {
  search: string;
  source: AccessSource | "todas";
  planId: string | "todos";
}

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Filtra por nome da organização, nome ou e-mail do owner, situação e plano vigente. */
export function filterClients(clientes: AdminClient[], filtros: ClientFilters): AdminClient[] {
  const termo = semAcento(filtros.search.trim());
  return clientes.filter((c) => {
    if (filtros.source !== "todas" && c.access_source !== filtros.source) return false;
    if (filtros.planId !== "todos" && c.plan_id !== filtros.planId) return false;
    if (!termo) return true;
    return [c.name, c.owner_name ?? "", c.owner_email ?? ""].some((campo) => semAcento(campo).includes(termo));
  });
}

export interface ClientsSummary {
  total: number;
  bySource: Record<AccessSource, number>;
  /** Assinaturas com pagamento em atraso (o Stripe ainda está cobrando). */
  delinquent: number;
  /** Testes que acabam nos próximos `dias` dias, sem assinatura. */
  trialsEndingSoon: AdminClient[];
  /** Sem acesso com contratação aguardando pagamento (boleto). */
  awaitingPayment: AdminClient[];
}

/** Contagens da visão geral. `agora` é injetável para teste. */
export function summarizeClients(clientes: AdminClient[], dias = 3, agora: Date = new Date()): ClientsSummary {
  const limite = agora.getTime() + dias * 86_400_000;
  const bySource: Record<AccessSource, number> = { subscription: 0, trial: 0, provisional: 0, none: 0 };
  for (const c of clientes) bySource[c.access_source] += 1;

  return {
    total: clientes.length,
    bySource,
    delinquent: clientes.filter((c) => c.subscription_status === "inadimplente").length,
    trialsEndingSoon: clientes
      .filter((c) => {
        if (c.access_source !== "trial" || !c.trial_ends_at) return false;
        const fim = new Date(c.trial_ends_at).getTime();
        return fim > agora.getTime() && fim <= limite;
      })
      .sort((a, b) => (a.trial_ends_at ?? "").localeCompare(b.trial_ends_at ?? "")),
    awaitingPayment: clientes.filter((c) => c.access_source === "none" && c.subscription_status === "incompleta"),
  };
}

// ─── Formatação ──────────────────────────────────────────────────────

/** "2026-10-01" → "out/26". O dia vem do banco como data, sem fuso. */
export function formatMonth(iso: string): string {
  const [ano, mes] = iso.slice(0, 7).split("-").map(Number);
  const nome = new Date(Date.UTC(ano, mes - 1, 1)).toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" });
  return `${nome.replace(".", "")}/${String(ano).slice(2)}`;
}

/** Taxa (0,0523) em texto ("5,2%"). */
export function formatPercent(taxa: number): string {
  return `${(taxa * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

// ─── Formulário de plano ─────────────────────────────────────────────

/**
 * Valor em reais digitado ("490", "490,00", "1.490,50") para centavos. Vazio
 * é plano "sob consulta" (null). Texto que não é valor devolve NaN.
 */
export function parseReais(texto: string): number | null {
  const limpo = texto.trim().replace(/^R\$\s*/i, "");
  if (!limpo) return null;
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(limpo)) return Number.NaN;
  const [inteiro, centavos = ""] = limpo.replace(/\./g, "").split(",");
  return Number(inteiro) * 100 + Number(centavos.padEnd(2, "0"));
}

/** Centavos para o campo do formulário ("490,00"). Nulo vira vazio. */
export function centsToInput(cents: number | null): string {
  if (cents == null) return "";
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Limite digitado: vazio é "sem limite" (null); texto que não é inteiro devolve NaN. */
export function parseLimit(texto: string): number | null {
  const limpo = texto.trim();
  if (!limpo) return null;
  return /^\d+$/.test(limpo) ? Number(limpo) : Number.NaN;
}

/** Recursos digitados um por linha, sem linhas vazias. */
export function parseFeatures(texto: string): string[] {
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

export type StripeSyncStatus = "sincronizado" | "inalterado" | "arquivado" | "sem_preco" | "nao_configurado" | "falhou";

/**
 * Aviso sobre o Stripe depois de salvar um plano (`admin-plans`). O banco já
 * foi gravado; isto só diz se o Stripe acompanhou. Nulo = nada a avisar.
 */
export function stripeSyncNotice(resultado: {
  status: StripeSyncStatus;
  message?: string;
}): { tone: "warning" | "info"; text: string } | null {
  switch (resultado.status) {
    case "falhou":
      return { tone: "warning", text: resultado.message ?? "O Stripe não foi atualizado. Use Sincronizar." };
    case "nao_configurado":
      return { tone: "info", text: "Stripe não configurado neste ambiente: o plano foi salvo só no banco." };
    case "arquivado":
      return { tone: "info", text: "Plano fora de venda: o produto foi arquivado no Stripe. Quem assina continua." };
    default:
      return null;
  }
}
