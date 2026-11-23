// Regras puras de `estimate-activation-values` (BP-9): leitura do corpo, prompt
// montado com a base da organização e normalização da resposta. Sem rede nem
// banco, para o teste do CI (`contexto_test.ts`).
//
// A estimativa é uma sugestão a partir dos projetos, das propostas e do
// catálogo da própria organização — não uma avaliação de mercado
// (`docs/business/propostas.md`). Por isso o prompt proíbe usar conhecimento
// de fora da base, e a ativação sem referência volta sem valor.

import type { EsquemaJson } from "../_shared/ai/tipos.ts";

export const MAX_ATIVACOES = 15;
export const LIMITE_ITENS = 50;
export const LIMITE_ITENS_POR_PROPOSTA = 25;
export const LIMITE_PROJETOS = 30;
export const LIMITE_PROPOSTAS = 30;
export const LIMITE_ATIVOS = 60;
/** Teto de sanidade para um valor sugerido (R$ 10 bilhões). */
const VALOR_MAXIMO = 10_000_000_000;

type Linha = Record<string, unknown>;

export interface AtivacaoDoPedido {
  title: string;
  description: string;
}

export interface ItemDeReferencia {
  name: string;
  description: string | null;
  quantity: number;
  unit_value: number;
}

export interface ProjetoDeReferencia {
  name: string;
  category: string | null;
  audience_estimate: number | null;
}

export interface PropostaDeReferencia {
  title: string;
  status: string;
  total_value: number;
  /** Valor geral fechado: os valores unitários dos itens não valem como referência. */
  use_flat_value: boolean;
  projeto: string | null;
  itens: ItemDeReferencia[];
}

export interface AtivoDeReferencia {
  name: string;
  category: string | null;
  unit_value: number;
}

export interface ContextoDaEstimativa {
  ativacoes: AtivacaoDoPedido[];
  itensDaProposta: ItemDeReferencia[];
  projetoAtual: ProjetoDeReferencia | null;
  projetos: ProjetoDeReferencia[];
  propostas: PropostaDeReferencia[];
  ativos: AtivoDeReferencia[];
}

export interface SugestaoNormalizada {
  index: number;
  suggested_value: number | null;
  rationale: string;
  overlaps_with: string | null;
}

export const SEM_REFERENCIA = "Sem referência parecida na base da sua organização.";
export const SEM_BASE = "A sua organização ainda não tem propostas enviadas ou aceitas nem ativos com valor para comparar.";

const texto = (valor: unknown, max: number) => (typeof valor === "string" ? valor.trim().slice(0, max) : "");
const lista = (valor: unknown): Linha[] =>
  Array.isArray(valor) ? valor.filter((v): v is Linha => !!v && typeof v === "object") : [];
const numero = (valor: unknown): number => {
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const numeroOuNulo = (valor: unknown): number | null => {
  if (valor === null || valor === undefined) return null;
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Ativações do corpo: de 1 a `MAX_ATIVACOES`, com título ou descrição. `null` = pedido inválido. */
export function lerAtivacoesDoCorpo(valor: unknown): AtivacaoDoPedido[] | null {
  if (!Array.isArray(valor) || valor.length === 0 || valor.length > MAX_ATIVACOES) return null;
  const ativacoes = valor.map((a) => {
    const linha = a && typeof a === "object" ? a as Linha : {};
    return { title: texto(linha.title, 300), description: texto(linha.description, 2000) };
  });
  return ativacoes.every((a) => a.title || a.description) ? ativacoes : null;
}

/** Itens de referência (do banco, ou do corpo na proposta que o assistente ainda não gravou). */
export function lerItens(valor: unknown, max = LIMITE_ITENS): ItemDeReferencia[] {
  return lista(valor)
    .map((i) => ({
      name: texto(i.name, 200),
      description: texto(i.description, 200) || null,
      quantity: Math.max(1, Math.round(numero(i.quantity)) || 1),
      unit_value: numero(i.unit_value),
    }))
    .filter((i) => i.name)
    .slice(0, max);
}

export function lerProjeto(linha: Linha): ProjetoDeReferencia {
  return {
    name: texto(linha.name, 200),
    category: texto(linha.category, 100) || null,
    audience_estimate: numeroOuNulo(linha.audience_estimate),
  };
}

export function lerAtivo(linha: Linha): AtivoDeReferencia {
  return { name: texto(linha.name, 200), category: texto(linha.category, 100) || null, unit_value: numero(linha.unit_value) };
}

export function lerProposta(linha: Linha, nomeDoProjeto: (id: unknown) => string | null): PropostaDeReferencia {
  return {
    title: texto(linha.title, 200) || "Sem título",
    status: texto(linha.status, 30),
    total_value: numero(linha.total_value),
    use_flat_value: linha.use_flat_value === true,
    projeto: nomeDoProjeto(linha.property_id),
    itens: lerItens(linha.proposal_items, LIMITE_ITENS_POR_PROPOSTA),
  };
}

/** Sem propostas e sem ativos com valor, não há o que comparar: a IA nem é chamada. */
export function temBase(contexto: ContextoDaEstimativa): boolean {
  return contexto.propostas.length > 0 || contexto.ativos.some((a) => a.unit_value > 0);
}

export function semBase(quantidade: number): SugestaoNormalizada[] {
  return Array.from({ length: quantidade }, (_, index) => ({
    index,
    suggested_value: null,
    rationale: SEM_BASE,
    overlaps_with: null,
  }));
}

const reais = (valor: number) =>
  `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const descreverProjeto = (p: ProjetoDeReferencia) =>
  `${p.name}${p.category ? ` (${p.category})` : ""}${p.audience_estimate ? `, público estimado ${p.audience_estimate.toLocaleString("pt-BR")}` : ""}`;

const descreverItem = (i: ItemDeReferencia, comValor: boolean) =>
  `${i.quantity}x ${i.name}${comValor ? ` (${reais(i.unit_value)} cada)` : ""}${i.description ? ` — ${i.description}` : ""}`;

function descreverProposta(p: PropostaDeReferencia): string {
  const cabecalho = `- "${p.title}" [${p.status}${p.projeto ? `, projeto ${p.projeto}` : ""}], total ${reais(p.total_value)}`;
  if (p.itens.length === 0) return `${cabecalho}, sem itens.`;
  const aviso = p.use_flat_value ? " (valor geral fechado: itens sem valor unitário)" : "";
  return `${cabecalho}${aviso}: ${p.itens.map((i) => descreverItem(i, !p.use_flat_value)).join("; ")}`;
}

export const SISTEMA = `Você ajuda uma organização de patrocínio esportivo a estimar o valor de ativações de uma proposta.
Use SOMENTE a base da própria organização enviada abaixo (propostas enviadas e aceitas, itens, catálogo de ativos e projetos).
Não use preços de mercado nem conhecimento externo: a estimativa é uma sugestão a partir dessa base, não uma avaliação de mercado.

Para cada ativação (pelo índice):
- suggested_value: valor em reais da ativação inteira (quantidade 1), comparando com itens e ativos parecidos da base e com o porte do projeto;
- has_reference: false quando nada na base for parecido o bastante; nesse caso suggested_value = 0;
- rationale: 1 ou 2 frases citando as propostas, itens ou ativos usados como referência;
- overlaps_with: nome exato de um item JÁ incluído na proposta atual que entregue a mesma coisa que a ativação (risco de cobrar duas vezes), ou "" se não houver.
Responda em português brasileiro.`;

export const ESQUEMA: EsquemaJson = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "number" },
          has_reference: { type: "boolean" },
          suggested_value: { type: "number" },
          rationale: { type: "string" },
          overlaps_with: { type: "string" },
        },
        required: ["index", "has_reference", "suggested_value", "rationale", "overlaps_with"],
      },
    },
  },
  required: ["suggestions"],
};

export function montarPedido(contexto: ContextoDaEstimativa): string {
  const ativacoes = contexto.ativacoes
    .map((a, i) => `[${i}] ${a.title || "(sem título)"}${a.description ? ` — ${a.description}` : ""}`)
    .join("\n");
  const itens = contexto.itensDaProposta.length
    ? contexto.itensDaProposta.map((i) => `- ${descreverItem(i, true)}`).join("\n")
    : "nenhum";
  const projetos = contexto.projetos.length ? contexto.projetos.map((p) => `- ${descreverProjeto(p)}`).join("\n") : "nenhum";
  const propostas = contexto.propostas.length ? contexto.propostas.map(descreverProposta).join("\n") : "nenhuma";
  const ativos = contexto.ativos.length
    ? contexto.ativos.map((a) => `- ${a.name}${a.category ? ` (${a.category})` : ""}: ${reais(a.unit_value)}`).join("\n")
    : "nenhum";

  return `ATIVAÇÕES A ESTIMAR:
${ativacoes}

PROJETO DA PROPOSTA: ${contexto.projetoAtual ? descreverProjeto(contexto.projetoAtual) : "não informado"}

ITENS JÁ INCLUÍDOS NA PROPOSTA ATUAL:
${itens}

BASE DA ORGANIZAÇÃO
Propostas enviadas e aceitas (mais recentes primeiro):
${propostas}

Catálogo de ativos:
${ativos}

Outros projetos:
${projetos}`;
}

const normalizarNome = (nome: string) => nome.trim().toLocaleLowerCase("pt-BR");

/**
 * Uma sugestão por ativação, na ordem do pedido. Índice repetido ou fora da
 * lista é ignorado; sobreposição só vale para o nome de um item que existe
 * (a IA não inventa item); sem referência, o valor volta `null`.
 */
export function normalizarSugestoes(
  resposta: unknown,
  quantidade: number,
  nomesDosItens: string[],
): SugestaoNormalizada[] {
  const itens = new Map(nomesDosItens.map((n) => [normalizarNome(n), n]));
  const porIndice = new Map<number, SugestaoNormalizada>();
  const linhas = resposta && typeof resposta === "object" ? lista((resposta as Linha).suggestions) : [];

  for (const linha of linhas) {
    const index = Number(linha.index);
    if (!Number.isInteger(index) || index < 0 || index >= quantidade || porIndice.has(index)) continue;
    const valor = numeroOuNulo(linha.suggested_value);
    const sugerido = linha.has_reference === true && valor !== null && valor > 0 && valor <= VALOR_MAXIMO
      ? Math.round(valor * 100) / 100
      : null;
    const sobreposicao = typeof linha.overlaps_with === "string"
      ? itens.get(normalizarNome(linha.overlaps_with)) ?? null
      : null;
    porIndice.set(index, {
      index,
      suggested_value: sugerido,
      rationale: texto(linha.rationale, 500) || (sugerido === null ? SEM_REFERENCIA : ""),
      overlaps_with: sobreposicao,
    });
  }

  return Array.from({ length: quantidade }, (_, index) =>
    porIndice.get(index) ?? { index, suggested_value: null, rationale: SEM_REFERENCIA, overlaps_with: null });
}
