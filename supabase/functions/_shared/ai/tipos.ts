// Interface neutra da camada de IA (backlog IA-05,
// docs/architecture/plano-ia-por-cliente.md §3 e §3.1).
//
// As Edge Functions descrevem o que precisam nestes tipos e nunca no formato
// de um fornecedor. Cada adaptador (OpenAI/Gemini, Anthropic) traduz o pedido
// e a resposta; trocar o fornecedor de uma organização não muda a função.

export const FORNECEDORES = ["openai", "gemini", "anthropic"] as const;
export type Fornecedor = typeof FORNECEDORES[number];

/** O que a funcionalidade precisa do modelo. Cada credencial mapeia nível → modelo. */
export const NIVEIS = ["rapido", "padrao", "visao"] as const;
export type Nivel = typeof NIVEIS[number];

/** De onde veio a chave usada (coluna `ai_usage_events.credential_scope`). */
export type EscopoDaCredencial = "exclusiva" | "padrao" | "via_padrao" | "semente";

/** Subconjunto de JSON Schema aceito pelos três fornecedores em tools e saídas estruturadas. */
export interface EsquemaJson {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  [chave: string]: unknown;
}

export type ParteDoConteudo =
  | { tipo: "texto"; texto: string }
  /** Imagem como data URL (`data:<mime>;base64,<dados>`), como o portal já envia. */
  | { tipo: "imagem"; dataUrl: string };

export interface ChamadaDeFerramenta {
  /** Id do fornecedor, para casar com o resultado no turno seguinte. */
  id: string;
  nome: string;
  argumentos: Record<string, unknown>;
}

export interface ResultadoDeFerramenta {
  idChamada: string;
  nome: string;
  conteudo: string;
}

export type Mensagem =
  | { papel: "usuario"; conteudo: string | ParteDoConteudo[] }
  | { papel: "assistente"; texto?: string; chamadas?: ChamadaDeFerramenta[] }
  /** Resultados das ferramentas de um mesmo turno, juntos. */
  | { papel: "resultados"; resultados: ResultadoDeFerramenta[] };

export interface Ferramenta {
  nome: string;
  descricao: string;
  parametros: EsquemaJson;
}

export interface PedidoDeIA {
  /** Nome da Edge Function; vai para `ai_usage_events.feature`. */
  funcionalidade: string;
  nivel: Nivel;
  sistema?: string;
  mensagens: Mensagem[];
  ferramentas?: Ferramenta[];
  /** Obriga o modelo a chamar esta ferramenta (precisa estar em `ferramentas`). */
  ferramentaObrigatoria?: string;
  /**
   * Pede a resposta como um objeto JSON neste formato. Exclui ferramentas: no
   * adaptador da Anthropic vira uma ferramenta obrigatória com o esquema.
   */
  json?: { nome: string; descricao?: string; esquema: EsquemaJson };
  maxTokens: number;
}

export interface UsoDeTokens {
  entrada: number;
  saida: number;
  /** Entrada lida do cache do fornecedor (cobrada mais barato). */
  entradaCache: number;
  /** Entrada gravada em cache (só a Anthropic cobra à parte). */
  escritaCache: number;
}

export interface RespostaDeIA {
  texto: string;
  chamadas: ChamadaDeFerramenta[];
  /** Presente quando o pedido usou `json`. */
  json?: Record<string, unknown>;
  /** `ferramenta` = o modelo parou para chamar ferramentas; `limite` = estourou maxTokens. */
  fimPor: "fim" | "ferramenta" | "limite";
  fornecedor: Fornecedor;
  modelo: string;
  uso: UsoDeTokens;
}

/** Quem pede: a organização já validada contra o JWT, e o usuário do JWT. */
export interface ContextoDeIA {
  organizacaoId: string;
  /** Nulo = rotina sem usuário. */
  usuarioId: string | null;
}

export const LIMITE_MAX_TOKENS = 32_000;

const NOME_VALIDO = /^[a-zA-Z0-9_-]{1,64}$/;

/** Se o pedido manda imagem: só um modelo com visão atende. */
export function exigeVisao(pedido: PedidoDeIA): boolean {
  return pedido.mensagens.some((m) =>
    m.papel === "usuario" && Array.isArray(m.conteudo) && m.conteudo.some((p) => p.tipo === "imagem")
  );
}

/**
 * Confere a coerência do pedido antes de gastar uma chamada. Pedido
 * incoerente é erro de programação da função, não do usuário: lança
 * TypeError (vira 500 e aparece no log).
 */
export function validarPedido(pedido: PedidoDeIA): void {
  if (!pedido.funcionalidade.trim()) throw new TypeError("Pedido de IA sem funcionalidade.");
  if (!NIVEIS.includes(pedido.nivel)) throw new TypeError(`Nível de IA desconhecido: ${pedido.nivel}.`);
  if (pedido.mensagens.length === 0) throw new TypeError("Pedido de IA sem mensagens.");
  if (pedido.mensagens[0].papel !== "usuario") {
    throw new TypeError("A primeira mensagem do pedido de IA precisa ser do usuário.");
  }
  if (!Number.isInteger(pedido.maxTokens) || pedido.maxTokens < 1 || pedido.maxTokens > LIMITE_MAX_TOKENS) {
    throw new TypeError(`maxTokens fora de 1..${LIMITE_MAX_TOKENS}.`);
  }

  const nomes = new Set<string>();
  for (const f of pedido.ferramentas ?? []) {
    if (!NOME_VALIDO.test(f.nome)) throw new TypeError(`Nome de ferramenta inválido: ${f.nome}.`);
    if (nomes.has(f.nome)) throw new TypeError(`Ferramenta repetida: ${f.nome}.`);
    nomes.add(f.nome);
  }
  if (pedido.ferramentaObrigatoria && !nomes.has(pedido.ferramentaObrigatoria)) {
    throw new TypeError(`Ferramenta obrigatória fora da lista: ${pedido.ferramentaObrigatoria}.`);
  }
  if (pedido.json) {
    if (nomes.size > 0) throw new TypeError("Pedido de IA com json não aceita ferramentas.");
    if (!NOME_VALIDO.test(pedido.json.nome)) throw new TypeError(`Nome do json inválido: ${pedido.json.nome}.`);
  }
  if (exigeVisao(pedido) && pedido.nivel !== "visao") {
    throw new TypeError("Pedido com imagem precisa do nível visao.");
  }
  for (const m of pedido.mensagens) {
    if (m.papel !== "usuario" || typeof m.conteudo === "string") continue;
    for (const p of m.conteudo) {
      if (p.tipo === "imagem" && !/^data:image\/[a-z0-9.+-]+;base64,/i.test(p.dataUrl)) {
        throw new TypeError("Imagem do pedido de IA precisa ser data URL base64.");
      }
    }
  }
}
