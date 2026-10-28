// Modelos padrão por nível e matriz de capacidades (backlog IA-08, plano §3
// decisão 2).
//
// Nenhum nome de modelo fica espalhado pelas funções: cada uma pede um nível
// (`rapido`, `padrao`, `visao`) e a credencial diz qual modelo atende cada
// nível. Os valores abaixo são o PONTO DE PARTIDA — preenchem a tela do
// superadmin e a credencial semente do ambiente. São provisórios: os
// definitivos saem da avaliação com chamadas reais (IA-22).
//
// Fontes (out/2026): Anthropic, tabela de modelos atuais da documentação
// oficial; OpenAI, página de modelos (gpt-5.4 como principal, mini para custo
// e latência); Gemini, página do gemini-3.6-flash (estável) e notas de versão
// do gemini-3.5-flash-lite (GA). Nomes de modelo mudam: confira antes de
// cadastrar.

import type { Fornecedor, Nivel } from "./tipos.ts";

export interface ModelosPorNivel {
  rapido: string;
  padrao: string;
  /** Nulo = sem modelo de visão: pedido com imagem usa a chave padrão (decisão Q4). */
  visao: string | null;
}

export const MODELOS_PADRAO: Record<Fornecedor, ModelosPorNivel> = {
  openai: { rapido: "gpt-5.4-mini", padrao: "gpt-5.4-mini", visao: "gpt-5.4-mini" },
  gemini: { rapido: "gemini-3.5-flash-lite", padrao: "gemini-3.6-flash", visao: "gemini-3.6-flash" },
  anthropic: { rapido: "claude-haiku-5-5", padrao: "claude-sonnet-5-5", visao: "claude-sonnet-5-5" },
};

/** Modelo que atende o nível; nulo quando a credencial não tem modelo de visão. */
export function modeloDoNivel(modelos: ModelosPorNivel, nivel: Nivel): string | null {
  return modelos[nivel];
}

/**
 * Se o modelo aceita obrigar uma ferramenta (`tool_choice` com nome).
 *
 * OpenAI e Gemini aceitam. Na Anthropic, Claude Opus 5.5, Sonnet 5.5 e
 * Fable 5.1 recusam com 400; a camada usa saída estruturada ou `auto` com
 * instrução. A lista é do que SABIDAMENTE aceita: modelo novo, desconhecido
 * aqui, vai pelo caminho que funciona em todos.
 */
export function aceitaFerramentaObrigatoria(fornecedor: Fornecedor, modelo: string): boolean {
  if (fornecedor !== "anthropic") return true;
  return /^claude-(haiku-5-5|haiku-4-5|sonnet-5|opus-5|fable-5|opus-4-\d+|sonnet-4-\d+)(-\d{8})?$/.test(modelo);
}

/**
 * Folga para o raciocínio interno. Os modelos atuais dos três fornecedores
 * pensam antes de responder, e esse raciocínio consome o mesmo limite de
 * saída: sem folga, uma função que pede 1.024 tokens de resposta pode
 * receber nada. Só o que é gerado é cobrado, então a folga não encarece.
 */
export const FOLGA_DE_RACIOCINIO = 8_000;
export const TETO_DE_SAIDA = 32_000;

/** Limite enviado ao fornecedor para uma resposta de `maxTokens`. */
export function limiteDeSaida(maxTokens: number): number {
  return Math.min(maxTokens + FOLGA_DE_RACIOCINIO, TETO_DE_SAIDA);
}
