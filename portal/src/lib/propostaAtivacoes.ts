// Ativações da versão "Conceito" de uma proposta (BP-9).
//
// As ativações vivem em `proposal_versions.metadata.activations` (jsonb) e podem
// virar itens livres da proposta (`proposal_items` sem `asset_id`). O valor é
// manual por padrão; a IA só sugere quando o usuário pede, e a sugestão vem da
// base da própria organização — não é avaliação de mercado
// (`docs/business/propostas.md`).

export type OrigemDoValor = "manual" | "ia";

// `type`, e não `interface`, para caber no `Json` do jsonb sem cast.
export type Ativacao = {
  title: string;
  description: string;
  /** Valor em reais da ativação inteira (vira o `unit_value` do item, com quantidade 1). */
  value?: number | null;
  value_source?: OrigemDoValor;
  /** Item da proposta que a IA apontou como possível duplicidade ao sugerir o valor. */
  overlaps_with?: string | null;
};

/** Escolha confirmada no modal de sugestão. */
export interface ValorConfirmado {
  index: number;
  value: number;
  overlaps_with?: string | null;
}

/** Sugestão de valor devolvida por `estimate-activation-values`, já normalizada. */
export interface SugestaoDeValor {
  index: number;
  /** `null` quando a base da organização não tem referência parecida. */
  suggested_value: number | null;
  rationale: string;
  /** Nome do item da proposta que a ativação pode duplicar. */
  overlaps_with: string | null;
}

export interface ItemDaProposta {
  name: string;
}

export const LIMITE_NOME_DO_ITEM = 200;
export const ATIVACAO_SEM_TITULO = "Ativação";

const numeroValido = (valor: unknown): number | null => {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

/** Lê as ativações do jsonb da versão, descartando o que não tiver a forma esperada. */
export function lerAtivacoes(metadata: unknown): Ativacao[] {
  const lista = metadata && typeof metadata === "object"
    ? (metadata as Record<string, unknown>).activations
    : undefined;
  if (!Array.isArray(lista)) return [];
  return lista
    .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
    .map((a) => {
      const value = numeroValido(a.value);
      const ativacao: Ativacao = {
        title: typeof a.title === "string" ? a.title : "",
        description: typeof a.description === "string" ? a.description : "",
        value,
      };
      if (value !== null) ativacao.value_source = a.value_source === "ia" ? "ia" : "manual";
      if (typeof a.overlaps_with === "string" && a.overlaps_with.trim()) ativacao.overlaps_with = a.overlaps_with;
      return ativacao;
    });
}

/** Valor que a ativação leva para o item: o informado, ou 0 enquanto estiver vazio. */
export function valorDaAtivacao(ativacao: Ativacao): number {
  return numeroValido(ativacao.value) ?? 0;
}

export function nomeDoItem(ativacao: Ativacao): string {
  const nome = ativacao.title.trim() || ATIVACAO_SEM_TITULO;
  return nome.slice(0, LIMITE_NOME_DO_ITEM);
}

const normalizar = (texto: string) => texto.trim().toLocaleLowerCase("pt-BR");

/** A ativação já está nos itens (mesmo nome, sem diferenciar maiúsculas). */
export function ativacaoJaNosItens(ativacao: Ativacao, itens: ItemDaProposta[]): boolean {
  const nome = normalizar(nomeDoItem(ativacao));
  return itens.some((i) => normalizar(i.name) === nome);
}

/** Payload do insert em `proposal_items`. A organização vem da proposta, pelo gatilho. */
export function ativacaoParaItem(ativacao: Ativacao, proposalId: string, posicao: number) {
  const descricao = ativacao.description.trim();
  return {
    proposal_id: proposalId,
    name: nomeDoItem(ativacao),
    description: descricao || null,
    quantity: 1,
    unit_value: valorDaAtivacao(ativacao),
    position: posicao,
  };
}

/** Item da proposta nova do assistente (ainda sem `proposal_id`). */
export function ativacaoParaEntrega(ativacao: Ativacao) {
  const descricao = ativacao.description.trim();
  return {
    name: nomeDoItem(ativacao),
    description: descricao || undefined,
    quantity: 1,
    unit_value: valorDaAtivacao(ativacao),
  };
}

/** Só as ativações que ainda não estão nos itens, na ordem da lista. */
export function ativacoesFaltando(ativacoes: Ativacao[], itens: ItemDaProposta[]): number[] {
  const nomes = new Set(itens.map((i) => normalizar(i.name)));
  const escolhidas: number[] = [];
  ativacoes.forEach((a, i) => {
    const nome = normalizar(nomeDoItem(a));
    if (nomes.has(nome)) return;
    nomes.add(nome);
    escolhidas.push(i);
  });
  return escolhidas;
}

/** Aplica os valores que o usuário confirmou no modal; o resto da lista não muda. */
export function aplicarValores(ativacoes: Ativacao[], escolhas: ValorConfirmado[]): Ativacao[] {
  const porIndice = new Map(escolhas.map((e) => [e.index, e]));
  return ativacoes.map((a, i) => {
    const escolha = porIndice.get(i);
    const value = escolha ? numeroValido(escolha.value) : null;
    if (!escolha || value === null) return a;
    const proxima: Ativacao = { ...a, value, value_source: "ia" };
    if (escolha.overlaps_with) proxima.overlaps_with = escolha.overlaps_with;
    else delete proxima.overlaps_with;
    return proxima;
  });
}

/** Valor digitado à mão: o selo de sugestão da IA sai (o aviso de duplicidade fica). */
export function definirValorManual(ativacao: Ativacao, valor: string): Ativacao {
  const value = numeroValido(valor);
  const proxima: Ativacao = { title: ativacao.title, description: ativacao.description };
  if (ativacao.overlaps_with) proxima.overlaps_with = ativacao.overlaps_with;
  return value === null ? proxima : { ...proxima, value, value_source: "manual" };
}

/**
 * Por que incluir a ativação nos itens pede confirmação, ou `null` quando não
 * há risco: o nome já está nos itens, ou a IA apontou um item que entrega a
 * mesma coisa (e ele ainda está na proposta).
 */
export function riscoDeDuplicar(ativacao: Ativacao, itens: ItemDaProposta[]): string | null {
  if (ativacaoJaNosItens(ativacao, itens)) return "Já está nos itens da proposta.";
  const apontado = ativacao.overlaps_with ? normalizar(ativacao.overlaps_with) : null;
  const item = apontado ? itens.find((i) => normalizar(i.name) === apontado) : undefined;
  return item ? `Pode duplicar o item "${item.name}".` : null;
}
