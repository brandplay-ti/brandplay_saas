// Medição do uso de IA (backlog IA-11, plano §3 decisão 6).
//
// Toda chamada — com sucesso, com erro ou barrada pela guarda — vira uma
// linha em `ai_usage_events`: organização, usuário, funcionalidade, nível,
// fornecedor, modelo, credencial, tokens, custo estimado, latência e
// resultado. NUNCA o prompt nem a resposta.
//
// Custo estimado em reais pelo preço vigente em `ai_model_prices`. Modelo
// sem preço grava custo nulo: os tokens ficam, o custo pode ser recalculado.
//
// Falha ao gravar a medição não derruba a resposta ao usuário: vai para o
// log (sem conteúdo) e a chamada segue.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { CodigoDeErroDeIA } from "./erros.ts";
import type { EscopoDaCredencial, Fornecedor, Nivel, UsoDeTokens } from "./tipos.ts";

/** Uma linha de `ai_usage_events`, com os nomes do banco. */
export interface EventoDeUso {
  organization_id: string;
  user_id: string | null;
  feature: string;
  tier: Nivel;
  provider: Fornecedor;
  model: string;
  credential_id: string | null;
  credential_scope: EscopoDaCredencial;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  cache_write_input_tokens: number;
  estimated_cost_brl: number | null;
  latency_ms: number | null;
  status: "sucesso" | "erro" | "bloqueado";
  error_code: CodigoDeErroDeIA | null;
}

/** Reais por 1 milhão de tokens. Nulo nas de cache = mesmo preço da entrada. */
export interface PrecoDeModelo {
  entrada: number;
  saida: number;
  entradaCache: number | null;
  escritaCache: number | null;
}

export interface RegistroDeUso {
  registrar(evento: EventoDeUso): Promise<void>;
}

export interface TabelaDePrecos {
  vigente(fornecedor: Fornecedor, modelo: string): Promise<PrecoDeModelo | null>;
}

export const USO_ZERADO: UsoDeTokens = { entrada: 0, saida: 0, entradaCache: 0, escritaCache: 0 };

/** Custo em reais, com 6 casas (a precisão da coluna). */
export function custoEstimado(uso: UsoDeTokens, preco: PrecoDeModelo | null): number | null {
  if (!preco) return null;
  const porToken = (precoPorMilhao: number) => precoPorMilhao / 1_000_000;
  const total = uso.entrada * porToken(preco.entrada) +
    uso.saida * porToken(preco.saida) +
    uso.entradaCache * porToken(preco.entradaCache ?? preco.entrada) +
    uso.escritaCache * porToken(preco.escritaCache ?? preco.entrada);
  return Math.round(total * 1_000_000) / 1_000_000;
}

export function registroSupabase(admin: SupabaseClient): RegistroDeUso {
  return {
    async registrar(evento) {
      const { error } = await admin.from("ai_usage_events").insert(evento);
      if (error) console.error("ai_usage_events: falha ao registrar uso", error.code ?? "?", evento.feature);
    },
  };
}

function numeroOuNulo(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

export function precosSupabase(admin: SupabaseClient): TabelaDePrecos {
  return {
    async vigente(fornecedor, modelo) {
      const hoje = new Date().toISOString().slice(0, 10);
      const { data, error } = await admin
        .from("ai_model_prices")
        .select("input_brl_per_mtok, output_brl_per_mtok, cached_input_brl_per_mtok, cache_write_input_brl_per_mtok")
        .eq("provider", fornecedor)
        .eq("model", modelo)
        .lte("valid_from", hoje)
        .order("valid_from", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error("ai_model_prices: falha ao ler preço", error.code ?? "?");
        return null;
      }
      if (!data) return null;
      const entrada = numeroOuNulo(data.input_brl_per_mtok);
      const saida = numeroOuNulo(data.output_brl_per_mtok);
      if (entrada === null || saida === null) return null;
      return {
        entrada,
        saida,
        entradaCache: numeroOuNulo(data.cached_input_brl_per_mtok),
        escritaCache: numeroOuNulo(data.cache_write_input_brl_per_mtok),
      };
    },
  };
}
