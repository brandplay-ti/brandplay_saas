/** Tipos das RPC `admin_ia_*` (0032) usadas na área `/admin/ia`. */

export type IaFornecedor = "openai" | "gemini" | "anthropic";

export interface AdminIaPadrao {
  credential_id: string;
  provider: IaFornecedor;
  model_rapido: string;
  model_padrao: string;
  model_visao: string | null;
  key_hint: string;
  last_validated_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  created_at: string;
  created_by: string | null;
}

export interface AdminIaCliente {
  organization_id: string;
  name: string;
  plan_id: string | null;
  mode: string;
  provider: IaFornecedor | null;
  model_padrao: string | null;
  key_hint: string | null;
  ai_enabled: boolean;
  budget_cents: number | null;
  alert_threshold_pct: number;
  hard_limit: boolean | null;
  pct_used: number | null;
  requests_month: number;
  input_tokens_month: number;
  output_tokens_month: number;
  spent_brl: number;
  via_padrao_month: number;
  last_call_status: string | null;
  last_call_error: string | null;
  last_call_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
}

export interface AdminIaPreco {
  id: string;
  provider: IaFornecedor;
  model: string;
  input_brl_per_mtok: number;
  output_brl_per_mtok: number;
  cached_input_brl_per_mtok: number | null;
  cache_write_input_brl_per_mtok: number | null;
  valid_from: string;
  created_at: string;
  updated_at: string;
}

export const IA_FORNECEDOR_LABEL: Record<IaFornecedor, string> = {
  openai: "OpenAI",
  gemini: "Google Gemini",
  anthropic: "Anthropic",
};

export const IA_MODO_LABEL: Record<string, string> = {
  exclusiva: "Chave exclusiva",
  padrao: "Chave padrão",
  semente: "Semente (ambiente)",
  via_padrao: "Padrão (visão)",
};

export interface AdminIaConsumoMes {
  mes: string;
  requisicoes: number;
  tokens_entrada: number;
  tokens_saida: number;
  gasto_brl: number;
  organizacoes: number;
}

export interface AdminIaTopMes {
  organization_id: string;
  nome: string;
  requisicoes: number;
  gasto_brl: number;
}

export interface AdminIaConsumo {
  meses: AdminIaConsumoMes[];
  top_mes: AdminIaTopMes[];
}

export function formatBrl(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
