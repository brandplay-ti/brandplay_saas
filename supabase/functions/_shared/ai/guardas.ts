// Guardas antes de cada chamada à IA (backlog IA-10, plano §3 decisão 7).
//
// Consulta `ia_situacao` (migration 0032, só service role) e barra, nesta
// ordem: IA desabilitada, cobrança bloqueada, orçamento esgotado (corte da
// decisão Q5) e limite de taxa por organização e por usuário.
//
// Falha fechada: se a consulta não responde, a chamada não sai — sem saber o
// orçamento, a camada não gasta.
//
// O limite de taxa conta só as chamadas que chegaram ao fornecedor nos
// últimos 60 s (`ai_usage_events`, gravado pela IA-11). Duas requisições
// simultâneas podem passar juntas da contagem: o limite é contra abuso e
// laço, não um teto exato.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { type Bloqueio, ehBloqueio, ErroDeIA, erroDeBloqueio } from "./erros.ts";
import type { ContextoDeIA } from "./tipos.ts";

/** Chamadas por minuto que chegaram ao fornecedor. Revisáveis com o uso real. */
export const LIMITE_POR_MINUTO_ORGANIZACAO = 60;
export const LIMITE_POR_MINUTO_USUARIO = 20;

/** Retrato de `ia_situacao` com o que a camada usa. */
export interface SituacaoDeIA {
  bloqueio: Bloqueio | null;
  chaveExclusiva: boolean;
  orcamentoCents: number | null;
  alertaPct: number;
  gastoMesBrl: number;
  alertaAtingido: boolean;
  orcamentoEsgotado: boolean;
  requisicoesMinutoOrganizacao: number;
  requisicoesMinutoUsuario: number;
}

/** Acesso ao banco, isolado para teste. Sempre com a service role. */
export interface ConsultaDeSituacao {
  situacao(contexto: ContextoDeIA): Promise<SituacaoDeIA>;
}

/** Usuário que não é membro ativo da organização (`ia_situacao` recusa). */
export class AcessoNegadoAIA extends Error {
  readonly status = 403;
  constructor() {
    super("Usuário não é membro ativo da organização.");
    this.name = "AcessoNegadoAIA";
  }
}

function numero(valor: unknown): number {
  const n = typeof valor === "string" ? Number(valor) : valor;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/** Converte o jsonb de `ia_situacao`; formato inesperado é falha fechada. */
export function lerSituacao(dados: unknown): SituacaoDeIA {
  if (dados === null || typeof dados !== "object" || Array.isArray(dados)) {
    throw new ErroDeIA("indisponivel", "ia_situacao devolveu formato inesperado", false, "plataforma");
  }
  const d = dados as Record<string, unknown>;
  if (d.bloqueio !== null && d.bloqueio !== undefined && !ehBloqueio(String(d.bloqueio))) {
    throw new ErroDeIA("indisponivel", `ia_situacao devolveu bloqueio desconhecido: ${String(d.bloqueio)}`, false, "plataforma");
  }
  return {
    bloqueio: (d.bloqueio ?? null) as Bloqueio | null,
    chaveExclusiva: d.chave_exclusiva === true,
    orcamentoCents: d.orcamento_cents === null || d.orcamento_cents === undefined ? null : numero(d.orcamento_cents),
    alertaPct: numero(d.alerta_pct),
    gastoMesBrl: numero(d.gasto_mes_brl),
    alertaAtingido: d.alerta_atingido === true,
    orcamentoEsgotado: d.orcamento_esgotado === true,
    requisicoesMinutoOrganizacao: numero(d.requisicoes_minuto_org),
    requisicoesMinutoUsuario: numero(d.requisicoes_minuto_usuario),
  };
}

export function consultaSupabase(admin: SupabaseClient): ConsultaDeSituacao {
  return {
    async situacao({ organizacaoId, usuarioId }) {
      const { data, error } = await admin.rpc("ia_situacao", { _org_id: organizacaoId, _user_id: usuarioId });
      if (error) {
        // 42501 vem tanto da recusa da própria ia_situacao (não membro) quanto
        // da falta de EXECUTE (cliente sem service role — erro de configuração).
        if (error.code === "42501" && /membro ativo/.test(error.message ?? "")) throw new AcessoNegadoAIA();
        throw new ErroDeIA("indisponivel", `ia_situacao falhou: ${error.code ?? "?"}`, false, "plataforma");
      }
      return lerSituacao(data);
    },
  };
}

/**
 * Barra a chamada quando a organização não pode usar a IA agora. Devolve a
 * situação para a camada registrar o uso e disparar alertas (IA-30).
 */
export async function verificarGuardas(contexto: ContextoDeIA, consulta: ConsultaDeSituacao): Promise<SituacaoDeIA> {
  let situacao: SituacaoDeIA;
  try {
    situacao = await consulta.situacao(contexto);
  } catch (e) {
    if (e instanceof ErroDeIA || e instanceof AcessoNegadoAIA) throw e;
    throw new ErroDeIA("indisponivel", "consulta de ia_situacao falhou", false, "plataforma");
  }

  if (situacao.bloqueio) throw erroDeBloqueio(situacao.bloqueio);
  if (situacao.requisicoesMinutoOrganizacao >= LIMITE_POR_MINUTO_ORGANIZACAO) {
    throw new ErroDeIA("limite_taxa", "limite interno por organização", false, "plataforma");
  }
  if (contexto.usuarioId && situacao.requisicoesMinutoUsuario >= LIMITE_POR_MINUTO_USUARIO) {
    throw new ErroDeIA("limite_taxa", "limite interno por usuário", false, "plataforma");
  }
  return situacao;
}
