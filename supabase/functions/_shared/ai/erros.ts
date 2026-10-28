// Categorias de erro da camada de IA (backlog IA-05).
//
// Toda falha — do fornecedor ou das guardas do BrandPlay — vira um código
// neutro. O código decide a mensagem ao usuário, o status HTTP, o registro em
// `ai_usage_events.error_code` / `ai_credentials.last_error` e se vale tentar
// de novo. Os códigos são exatamente os aceitos pelos `check` da migration
// 0031 (o teste confere).
//
// Mensagem ao usuário nunca cita fornecedor, modelo nem detalhe técnico
// (decisão Q3). A mensagem interna (`message`, para o log) leva fornecedor e
// status HTTP, nunca o corpo da resposta: o fornecedor pode ecoar parte da
// chave no texto do erro.

import type { Fornecedor } from "./tipos.ts";

/** Falhas na conversa com o fornecedor. Também vão para `ai_credentials.last_error`. */
export const ERROS_DO_FORNECEDOR = [
  "chave_invalida",
  "sem_saldo",
  "limite_taxa",
  "indisponivel",
  "resposta_invalida",
] as const;

/** Bloqueios das guardas do BrandPlay, antes de chamar o fornecedor (`ia_situacao`). */
export const BLOQUEIOS = ["ia_desabilitada", "orcamento_esgotado", "cobranca_bloqueada"] as const;

export type ErroDoFornecedor = typeof ERROS_DO_FORNECEDOR[number];
export type Bloqueio = typeof BLOQUEIOS[number];
export type CodigoDeErroDeIA = ErroDoFornecedor | Bloqueio;

const MENSAGEM_SUPORTE = "Não foi possível usar a IA da sua organização no momento. Entre em contato com o suporte.";

const CATALOGO: Record<CodigoDeErroDeIA, { status: number; mensagem: string }> = {
  chave_invalida: { status: 502, mensagem: MENSAGEM_SUPORTE },
  sem_saldo: { status: 502, mensagem: MENSAGEM_SUPORTE },
  limite_taxa: { status: 429, mensagem: "Muitas solicitações de IA em pouco tempo. Tente novamente em instantes." },
  indisponivel: {
    status: 503,
    mensagem: "O serviço de IA está indisponível no momento. Tente novamente em alguns minutos.",
  },
  resposta_invalida: { status: 502, mensagem: "A IA retornou uma resposta inesperada. Tente novamente." },
  ia_desabilitada: { status: 403, mensagem: "Os recursos de IA estão desativados para a sua organização." },
  orcamento_esgotado: {
    status: 402,
    mensagem: "O limite mensal de uso de IA da sua organização foi atingido. Fale com o administrador da conta.",
  },
  cobranca_bloqueada: {
    status: 402,
    mensagem: "O acesso da sua organização está suspenso. Regularize o plano para voltar a usar a IA.",
  },
};

export class ErroDeIA extends Error {
  readonly status: number;
  readonly mensagemAoUsuario: string;

  constructor(
    readonly codigo: CodigoDeErroDeIA,
    /** Para o log: fornecedor, status HTTP, contexto. Nunca chave nem corpo da resposta. */
    detalheInterno: string,
    /** Só falhas transitórias do fornecedor; bloqueio das guardas nunca. */
    readonly tentarDeNovo = false,
    /**
     * Quem falhou: o fornecedor (resposta da API) ou a própria plataforma
     * (guardas, configuração). O limite de taxa interno, por exemplo, usa o
     * código `limite_taxa` mas não é falha da credencial.
     */
    readonly origem: "fornecedor" | "plataforma" = "fornecedor",
  ) {
    super(`${codigo}: ${detalheInterno}`);
    this.name = "ErroDeIA";
    this.status = CATALOGO[codigo].status;
    this.mensagemAoUsuario = CATALOGO[codigo].mensagem;
  }

  /** Se a falha é da credencial no fornecedor (vai para `ai_credentials.last_error`). */
  get daCredencial(): boolean {
    return this.origem === "fornecedor" && (ERROS_DO_FORNECEDOR as readonly string[]).includes(this.codigo);
  }
}

export function ehBloqueio(codigo: string): codigo is Bloqueio {
  return (BLOQUEIOS as readonly string[]).includes(codigo);
}

/** Bloqueio devolvido por `ia_situacao` como erro da camada. */
export function erroDeBloqueio(bloqueio: Bloqueio): ErroDeIA {
  return new ErroDeIA(bloqueio, "bloqueado pela guarda ia_situacao", false, "plataforma");
}

/**
 * Classificação base de uma resposta HTTP de erro do fornecedor. Cada
 * adaptador refina com o corpo antes de cair aqui (ex.: `insufficient_quota`
 * da OpenAI chega como 429, mas é `sem_saldo`).
 *
 * Outros 4xx (modelo inexistente, pedido recusado) viram `resposta_invalida`:
 * para o usuário é uma falha inesperada, e na credencial o superadmin vê que
 * algo na configuração não fecha.
 */
export function erroPorStatusHttp(fornecedor: Fornecedor, status: number): ErroDeIA {
  const detalhe = `${fornecedor} respondeu HTTP ${status}`;
  if (status === 401 || status === 403) return new ErroDeIA("chave_invalida", detalhe);
  if (status === 402) return new ErroDeIA("sem_saldo", detalhe);
  if (status === 429) return new ErroDeIA("limite_taxa", detalhe, true);
  if (status === 408 || status >= 500) return new ErroDeIA("indisponivel", detalhe, true);
  return new ErroDeIA("resposta_invalida", detalhe);
}

/**
 * Corpo de erro para o portal. `error` continua texto — é o que as telas já
 * leem (`data.error`) —, e `codigo` permite tratar cada caso (IA-13).
 */
export function corpoDeErro(erro: ErroDeIA): { error: string; codigo: CodigoDeErroDeIA } {
  return { error: erro.mensagemAoUsuario, codigo: erro.codigo };
}

export function respostaDeErro(erro: ErroDeIA, cabecalhos: Record<string, string>): Response {
  return new Response(JSON.stringify(corpoDeErro(erro)), {
    status: erro.status,
    headers: { ...cabecalhos, "Content-Type": "application/json" },
  });
}
