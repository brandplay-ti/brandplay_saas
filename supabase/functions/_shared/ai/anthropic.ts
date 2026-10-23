// Adaptador da Anthropic (Messages API) — backlog IA-07, plano §3.1.
//
// Sai do formato que as 13 funções já usavam (MIGRATION_NOTES.md): `system`
// de nível superior, blocos `tool_use`/`tool_result`, imagem em
// `source.base64`. URL fixa aqui, como no openai_compat.
//
// Saída JSON: a Anthropic não tem um modo JSON equivalente ao
// `response_format`. O pedido `json` vira uma ferramenta obrigatória com o
// esquema, e a resposta é o `input` dela — mais firme que pedir JSON no
// texto, como as funções faziam. Essa ferramenta é interna: não aparece em
// `chamadas`.
//
// Nada daqui registra corpo de pedido ou de resposta.

import { ErroDeIA, erroPorStatusHttp } from "./erros.ts";
import {
  type Adaptador,
  type ChamadaAoFornecedor,
  type ChamadaDeFerramenta,
  type PedidoDeIA,
  type RespostaDeIA,
  TIMEOUT_PADRAO_MS,
  type UsoDeTokens,
  validarPedido,
} from "./tipos.ts";

export const URL_ANTHROPIC = "https://api.anthropic.com/v1/messages";
export const VERSAO_API_ANTHROPIC = "2023-06-01";

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
  // A Anthropic exige papéis alternados: blocos seguidos do mesmo papel (ex.:
  // resultados de ferramenta e a próxima pergunta do usuário) vão juntos.
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
  const corpo: Record<string, unknown> = {
    model: modelo,
    max_tokens: pedido.maxTokens,
    messages: mensagensAnthropic(pedido),
  };
  if (pedido.sistema?.trim()) corpo.system = pedido.sistema;

  if (pedido.json) {
    corpo.tools = [{
      name: pedido.json.nome,
      description: pedido.json.descricao ?? "Devolve a resposta no formato pedido.",
      input_schema: pedido.json.esquema,
    }];
    corpo.tool_choice = { type: "tool", name: pedido.json.nome };
    return corpo;
  }
  if (pedido.ferramentas?.length) {
    corpo.tools = pedido.ferramentas.map((f) => ({ name: f.nome, description: f.descricao, input_schema: f.parametros }));
  }
  if (pedido.ferramentaObrigatoria) {
    corpo.tool_choice = { type: "tool", name: pedido.ferramentaObrigatoria };
  }
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
  const uso = usoAnthropic(corpo.usage);
  const limite = corpo.stop_reason === "max_tokens";

  if (pedido.json) {
    const saida = chamadas.find((c) => c.nome === pedido.json!.nome);
    if (!saida) throw invalida(limite ? "saída JSON cortada pelo limite de tokens" : "não devolveu a saída JSON pedida");
    return {
      texto: textos.join(""),
      chamadas: [],
      json: saida.argumentos,
      fimPor: limite ? "limite" : "fim",
      fornecedor: "anthropic",
      modelo,
      uso,
    };
  }

  if (pedido.ferramentaObrigatoria && !chamadas.some((c) => c.nome === pedido.ferramentaObrigatoria)) {
    throw invalida(`não chamou a ferramenta obrigatória ${pedido.ferramentaObrigatoria}`);
  }

  return {
    texto: textos.join(""),
    chamadas,
    fimPor: limite ? "limite" : chamadas.length > 0 || corpo.stop_reason === "tool_use" ? "ferramenta" : "fim",
    fornecedor: "anthropic",
    modelo,
    uso,
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
