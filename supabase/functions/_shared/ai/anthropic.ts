// Adaptador da Anthropic (Messages API) — backlog IA-07, ajustado na IA-08.
//
// Sai do formato que as 13 funções já usavam (MIGRATION_NOTES.md): `system`
// de nível superior, blocos `tool_use`/`tool_result`, imagem em
// `source.base64`. URL fixa aqui, como no openai_compat.
//
// Saída JSON e ferramenta obrigatória (matriz em modelos.ts):
//
// - JSON pedido: saída estruturada (`output_config.format`), o caminho
//   oficial e o único que funciona em todos os modelos atuais.
// - Ferramenta obrigatória, modelo que aceita `tool_choice` com nome: vai
//   assim.
// - Ferramenta obrigatória, modelo que recusa (Opus 5.5, Sonnet 5.5,
//   Fable 5.1 dão 400): se é a única ferramenta — o caso das funções que só
//   querem os dados no formato da ferramenta —, vira saída estruturada com o
//   esquema dela e volta como uma chamada; com outras ferramentas junto, vai
//   `auto` com instrução no `system`, e a falta da chamada é
//   `resposta_invalida`.
//
// A saída estruturada exige `additionalProperties: false` em todo objeto e
// não aceita limites numéricos e de tamanho: o esquema é ajustado aqui.
//
// Nada daqui registra corpo de pedido ou de resposta.

import { ErroDeIA, erroPorStatusHttp } from "./erros.ts";
import { aceitaFerramentaObrigatoria, limiteDeSaida } from "./modelos.ts";
import {
  type Adaptador,
  type ChamadaAoFornecedor,
  type ChamadaDeFerramenta,
  type EsquemaJson,
  extrairObjetoJson,
  type PedidoDeIA,
  type RespostaDeIA,
  TIMEOUT_PADRAO_MS,
  type UsoDeTokens,
  validarPedido,
} from "./tipos.ts";

export const URL_ANTHROPIC = "https://api.anthropic.com/v1/messages";
export const VERSAO_API_ANTHROPIC = "2023-06-01";

/** Id da chamada sintética quando a ferramenta obrigatória vira saída estruturada. */
export const ID_SAIDA_ESTRUTURADA = "saida_estruturada";

type Modo =
  | { tipo: "livre" }
  | { tipo: "json" }
  | { tipo: "ferramenta_forcada"; nome: string }
  | { tipo: "ferramenta_como_saida"; nome: string; esquema: EsquemaJson }
  | { tipo: "ferramenta_por_instrucao"; nome: string };

export function modoDoPedido(pedido: PedidoDeIA, modelo: string): Modo {
  if (pedido.json) return { tipo: "json" };
  const nome = pedido.ferramentaObrigatoria;
  if (!nome) return { tipo: "livre" };
  if (aceitaFerramentaObrigatoria("anthropic", modelo)) return { tipo: "ferramenta_forcada", nome };
  const ferramentas = pedido.ferramentas ?? [];
  if (ferramentas.length === 1) return { tipo: "ferramenta_como_saida", nome, esquema: ferramentas[0].parametros };
  return { tipo: "ferramenta_por_instrucao", nome };
}

// ─── Esquema para saída estruturada ──────────────────────────────────

const RESTRICOES_NAO_ACEITAS = [
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "uniqueItems",
];

/** Copia o esquema fechando os objetos e tirando as restrições que a saída estruturada recusa. */
export function esquemaParaSaidaEstruturada(no: unknown): unknown {
  if (Array.isArray(no)) return no.map((item) => esquemaParaSaidaEstruturada(item));
  if (no === null || typeof no !== "object") return no;

  const saida: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(no as Record<string, unknown>)) {
    if (RESTRICOES_NAO_ACEITAS.includes(chave)) continue;
    if (chave === "properties" || chave === "$defs" || chave === "definitions") {
      // Mapa de nome → esquema: não confundir os nomes com palavras-chave.
      saida[chave] = Object.fromEntries(
        Object.entries(valor as Record<string, unknown>).map(([nome, esq]) => [nome, esquemaParaSaidaEstruturada(esq)]),
      );
    } else {
      saida[chave] = esquemaParaSaidaEstruturada(valor);
    }
  }
  if (saida.type === "object" || "properties" in saida) saida.additionalProperties = false;
  return saida;
}

// ─── Pedido ──────────────────────────────────────────────────────────

type Bloco = Record<string, unknown>;
interface MensagemAnthropic {
  role: "user" | "assistant";
  content: Bloco[];
}

/** `data:<mime>;base64,<dados>` → bloco de imagem da Anthropic. */
export function blocoDeImagem(dataUrl: string): Bloco {
  const virgula = dataUrl.indexOf(",");
  const mime = /^data:([^;]+);base64$/i.exec(dataUrl.slice(0, virgula))?.[1] ?? "image/jpeg";
  return { type: "image", source: { type: "base64", media_type: mime, data: dataUrl.slice(virgula + 1) } };
}

function mensagensAnthropic(pedido: PedidoDeIA): MensagemAnthropic[] {
  const saida: MensagemAnthropic[] = [];
  // Papéis alternados: blocos seguidos do mesmo papel (ex.: resultados de
  // ferramenta e a próxima pergunta do usuário) vão juntos.
  const acrescentar = (role: MensagemAnthropic["role"], blocos: Bloco[]) => {
    if (blocos.length === 0) return;
    const ultima = saida[saida.length - 1];
    if (ultima?.role === role) ultima.content.push(...blocos);
    else saida.push({ role, content: blocos });
  };

  for (const m of pedido.mensagens) {
    if (m.papel === "usuario") {
      acrescentar(
        "user",
        typeof m.conteudo === "string"
          ? [{ type: "text", text: m.conteudo }]
          : m.conteudo.map((p) => p.tipo === "texto" ? { type: "text", text: p.texto } : blocoDeImagem(p.dataUrl)),
      );
    } else if (m.papel === "assistente") {
      acrescentar("assistant", [
        // Bloco de texto vazio é recusado pela API.
        ...(m.texto?.trim() ? [{ type: "text", text: m.texto }] : []),
        ...(m.chamadas ?? []).map((c) => ({ type: "tool_use", id: c.id, name: c.nome, input: c.argumentos })),
      ]);
    } else {
      acrescentar(
        "user",
        m.resultados.map((r) => ({ type: "tool_result", tool_use_id: r.idChamada, content: r.conteudo })),
      );
    }
  }
  return saida;
}

export function montarCorpo(pedido: PedidoDeIA, modelo: string): Record<string, unknown> {
  const modo = modoDoPedido(pedido, modelo);
  let sistema = pedido.sistema?.trim() ?? "";
  if (modo.tipo === "ferramenta_por_instrucao") {
    sistema = `${sistema}\n\nResponda chamando a ferramenta ${modo.nome}.`.trim();
  }

  const corpo: Record<string, unknown> = {
    model: modelo,
    // O limite inclui o raciocínio do modelo: vai com folga (modelos.ts).
    max_tokens: limiteDeSaida(pedido.maxTokens),
    messages: mensagensAnthropic(pedido),
  };
  if (sistema) corpo.system = sistema;

  if (modo.tipo === "json" || modo.tipo === "ferramenta_como_saida") {
    const esquema = modo.tipo === "json" ? pedido.json!.esquema : modo.esquema;
    corpo.output_config = { format: { type: "json_schema", schema: esquemaParaSaidaEstruturada(esquema) } };
    return corpo;
  }
  if (pedido.ferramentas?.length) {
    corpo.tools = pedido.ferramentas.map((f) => ({ name: f.nome, description: f.descricao, input_schema: f.parametros }));
  }
  if (modo.tipo === "ferramenta_forcada") corpo.tool_choice = { type: "tool", name: modo.nome };
  return corpo;
}

// ─── Resposta ────────────────────────────────────────────────────────

function numero(valor: unknown): number {
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0 ? Math.floor(valor) : 0;
}

function usoAnthropic(usage: Record<string, unknown> | undefined): UsoDeTokens {
  // `input_tokens` já exclui o que foi lido e gravado no cache.
  return {
    entrada: numero(usage?.input_tokens),
    saida: numero(usage?.output_tokens),
    entradaCache: numero(usage?.cache_read_input_tokens),
    escritaCache: numero(usage?.cache_creation_input_tokens),
  };
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor);
}

export function lerResposta(dados: unknown, pedido: PedidoDeIA, modelo: string): RespostaDeIA {
  const invalida = (motivo: string) => new ErroDeIA("resposta_invalida", `anthropic/${modelo}: ${motivo}`);
  const corpo = dados as { content?: unknown; stop_reason?: unknown; usage?: Record<string, unknown> };
  if (!Array.isArray(corpo?.content)) throw invalida("resposta sem content");
  // Recusa dos classificadores de segurança: o conteúdo pode não seguir o pedido.
  if (corpo.stop_reason === "refusal") throw invalida("o modelo recusou o pedido");

  const textos: string[] = [];
  const chamadas: ChamadaDeFerramenta[] = [];
  for (const bruto of corpo.content as Bloco[]) {
    if (bruto.type === "text" && typeof bruto.text === "string") {
      textos.push(bruto.text);
    } else if (bruto.type === "tool_use") {
      if (typeof bruto.id !== "string" || typeof bruto.name !== "string") throw invalida("tool_use sem id ou nome");
      if (!ehObjeto(bruto.input)) throw invalida(`entrada da ferramenta ${bruto.name} não é um objeto`);
      chamadas.push({ id: bruto.id, nome: bruto.name, argumentos: bruto.input });
    }
  }
  const texto = textos.join("");
  const uso = usoAnthropic(corpo.usage);
  const limite = corpo.stop_reason === "max_tokens";
  const base = { fornecedor: "anthropic" as const, modelo, uso };
  const modo = modoDoPedido(pedido, modelo);

  if (modo.tipo === "json" || modo.tipo === "ferramenta_como_saida") {
    const objeto = extrairObjetoJson(texto);
    if (!objeto) throw invalida(limite ? "saída estruturada cortada pelo limite de tokens" : "saída estruturada não é um objeto JSON");
    if (modo.tipo === "json") return { ...base, texto, chamadas: [], json: objeto, fimPor: "fim" };
    return {
      ...base,
      texto: "",
      chamadas: [{ id: ID_SAIDA_ESTRUTURADA, nome: modo.nome, argumentos: objeto }],
      fimPor: "ferramenta",
    };
  }

  if (pedido.ferramentaObrigatoria && !chamadas.some((c) => c.nome === pedido.ferramentaObrigatoria)) {
    throw invalida(`não chamou a ferramenta obrigatória ${pedido.ferramentaObrigatoria}`);
  }

  return {
    ...base,
    texto,
    chamadas,
    fimPor: limite ? "limite" : chamadas.length > 0 || corpo.stop_reason === "tool_use" ? "ferramenta" : "fim",
  };
}

// ─── Erros ───────────────────────────────────────────────────────────

/**
 * Refina pela estrutura `{type:"error", error:{type, message}}`. Falta de
 * crédito chega como 400 `invalid_request_error` (ou `billing_error`); o texto
 * da mensagem só é examinado para esse caso.
 */
export function classificarErro(status: number, corpo: string): ErroDeIA {
  const detalhe = `anthropic respondeu HTTP ${status}`;
  let erro: Record<string, unknown> = {};
  try {
    erro = (JSON.parse(corpo)?.error ?? {}) as Record<string, unknown>;
  } catch {
    // corpo não-JSON: fica a classificação por status
  }
  const tipo = String(erro.type ?? "");

  if (tipo === "authentication_error" || tipo === "permission_error") return new ErroDeIA("chave_invalida", detalhe);
  if (tipo === "billing_error") return new ErroDeIA("sem_saldo", detalhe);
  if (tipo === "invalid_request_error" && /credit balance/i.test(String(erro.message ?? ""))) {
    return new ErroDeIA("sem_saldo", detalhe);
  }
  if (tipo === "rate_limit_error") return new ErroDeIA("limite_taxa", detalhe, true);
  if (tipo === "overloaded_error" || tipo === "api_error") return new ErroDeIA("indisponivel", detalhe, true);
  return erroPorStatusHttp("anthropic", status);
}

// ─── Chamada ─────────────────────────────────────────────────────────

export const chamarAnthropic: Adaptador = async (chamada: ChamadaAoFornecedor): Promise<RespostaDeIA> => {
  const { fornecedor, chave, modelo, pedido } = chamada;
  if (fornecedor !== "anthropic") {
    throw new TypeError(`Fornecedor ${fornecedor} não usa o adaptador da Anthropic.`);
  }
  validarPedido(pedido);

  const fazerFetch = chamada.fetch ?? fetch;
  let resposta: Response;
  try {
    resposta = await fazerFetch(URL_ANTHROPIC, {
      method: "POST",
      headers: {
        "x-api-key": chave,
        "anthropic-version": VERSAO_API_ANTHROPIC,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(montarCorpo(pedido, modelo)),
      signal: AbortSignal.timeout(chamada.timeoutMs ?? TIMEOUT_PADRAO_MS),
    });
  } catch (e) {
    const tempo = e instanceof DOMException && e.name === "TimeoutError";
    throw new ErroDeIA("indisponivel", `anthropic: ${tempo ? "tempo esgotado" : "falha de rede"}`, true);
  }

  if (!resposta.ok) {
    throw classificarErro(resposta.status, await resposta.text().catch(() => ""));
  }
  let dados: unknown;
  try {
    dados = await resposta.json();
  } catch {
    throw new ErroDeIA("resposta_invalida", `anthropic/${modelo}: corpo não é JSON`);
  }
  return lerResposta(dados, pedido, modelo);
};
