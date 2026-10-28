// Adaptador `openai_compat`: OpenAI e Google Gemini pelo formato Chat
// Completions (backlog IA-06, plano §3.1).
//
// O Gemini é chamado pelo endpoint compatível com OpenAI documentado pelo
// Google (`.../v1beta/openai/`), com a chave da API Gemini. As diferenças
// que importam ficam em PERFIS; a URL base é fixa aqui — nunca vem da tela
// nem do banco, para não virar canal de desvio de prompt e chave.
//
// Saída JSON: `response_format: json_schema` sem `strict` (os esquemas das
// funções não seguem as regras do modo estrito: todos os campos obrigatórios
// e `additionalProperties: false`). A garantia vem do parse aqui: resposta
// que não é um objeto JSON vira `resposta_invalida`.
//
// Ferramentas no Gemini 3: cada chamada vem com uma assinatura de
// raciocínio em `tool_calls[].extra_content.google.thought_signature`, campo
// fora do formato da OpenAI. Ela precisa voltar na mesma chamada quando o
// histórico é reenviado no turno seguinte — sem ela, o Gemini responde 400.
// O adaptador guarda em `ChamadaDeFerramenta.assinatura` e só a reenvia ao
// Gemini (a OpenAI não conhece o campo).
//
// Nada daqui registra corpo de pedido ou de resposta: só fornecedor, modelo
// e status HTTP vão para a mensagem interna do erro.

import { ErroDeIA, erroPorStatusHttp } from "./erros.ts";
import { limiteDeSaida } from "./modelos.ts";
import {
  type Adaptador,
  type ChamadaAoFornecedor,
  type ChamadaDeFerramenta,
  extrairObjetoJson,
  type Mensagem,
  type PedidoDeIA,
  type RespostaDeIA,
  TIMEOUT_PADRAO_MS,
  type UsoDeTokens,
  validarPedido,
} from "./tipos.ts";

type FornecedorCompat = "openai" | "gemini";

interface Perfil {
  urlBase: string;
  /** Modelos novos da OpenAI recusam `max_tokens`. */
  campoMaxTokens: "max_completion_tokens" | "max_tokens";
}

export const PERFIS: Record<FornecedorCompat, Perfil> = {
  openai: { urlBase: "https://api.openai.com/v1", campoMaxTokens: "max_completion_tokens" },
  gemini: { urlBase: "https://generativelanguage.googleapis.com/v1beta/openai", campoMaxTokens: "max_tokens" },
};

// ─── Pedido ──────────────────────────────────────────────────────────

type MensagemCompat =
  | { role: "system" | "user"; content: string | unknown[] }
  | { role: "assistant"; content: string | null; tool_calls?: unknown[] }
  | { role: "tool"; tool_call_id: string; content: string };

function mensagensCompat(pedido: PedidoDeIA, fornecedor: FornecedorCompat): MensagemCompat[] {
  const saida: MensagemCompat[] = [];
  let sistema = pedido.sistema?.trim() ?? "";
  if (pedido.json) {
    // Reforço para o modo JSON: o esquema já vai em `response_format`.
    sistema = `${sistema}\n\nResponda apenas com um objeto JSON válido, sem markdown.`.trim();
  }
  if (sistema) saida.push({ role: "system", content: sistema });

  for (const m of pedido.mensagens as Mensagem[]) {
    if (m.papel === "usuario") {
      saida.push({
        role: "user",
        content: typeof m.conteudo === "string" ? m.conteudo : m.conteudo.map((p) =>
          p.tipo === "texto"
            ? { type: "text", text: p.texto }
            : { type: "image_url", image_url: { url: p.dataUrl } }
        ),
      });
    } else if (m.papel === "assistente") {
      saida.push({
        role: "assistant",
        content: m.texto ?? null,
        ...(m.chamadas?.length
          ? {
            tool_calls: m.chamadas.map((c) => ({
              id: c.id,
              type: "function",
              function: { name: c.nome, arguments: JSON.stringify(c.argumentos) },
              ...(fornecedor === "gemini" && c.assinatura
                ? { extra_content: { google: { thought_signature: c.assinatura } } }
                : {}),
            })),
          }
          : {}),
      });
    } else {
      for (const r of m.resultados) saida.push({ role: "tool", tool_call_id: r.idChamada, content: r.conteudo });
    }
  }
  return saida;
}

export function montarCorpo(pedido: PedidoDeIA, modelo: string, fornecedor: FornecedorCompat): Record<string, unknown> {
  const corpo: Record<string, unknown> = {
    model: modelo,
    messages: mensagensCompat(pedido, fornecedor),
    // O limite inclui o raciocínio do modelo: vai com folga (modelos.ts).
    [PERFIS[fornecedor].campoMaxTokens]: limiteDeSaida(pedido.maxTokens),
  };
  if (pedido.ferramentas?.length) {
    corpo.tools = pedido.ferramentas.map((f) => ({
      type: "function",
      function: {
        name: f.nome,
        description: f.descricao,
        // Ferramenta sem parâmetros vai sem `parameters`: o Gemini recusa
        // objeto com `properties` vazio; a OpenAI aceita a ausência.
        ...(Object.keys(f.parametros.properties).length ? { parameters: f.parametros } : {}),
      },
    }));
  }
  if (pedido.ferramentaObrigatoria) {
    corpo.tool_choice = { type: "function", function: { name: pedido.ferramentaObrigatoria } };
  }
  if (pedido.json) {
    corpo.response_format = {
      type: "json_schema",
      json_schema: {
        name: pedido.json.nome,
        ...(pedido.json.descricao ? { description: pedido.json.descricao } : {}),
        schema: pedido.json.esquema,
      },
    };
  }
  return corpo;
}

// ─── Resposta ────────────────────────────────────────────────────────

function numero(valor: unknown): number {
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0 ? Math.floor(valor) : 0;
}

function usoCompat(usage: Record<string, unknown> | undefined): UsoDeTokens {
  const detalhes = (usage?.prompt_tokens_details ?? {}) as Record<string, unknown>;
  const entradaTotal = numero(usage?.prompt_tokens);
  // `prompt_tokens` inclui a parte lida do cache; separa para o preço certo.
  const entradaCache = Math.min(numero(detalhes.cached_tokens), entradaTotal);
  return { entrada: entradaTotal - entradaCache, saida: numero(usage?.completion_tokens), entradaCache, escritaCache: 0 };
}

export function lerResposta(
  dados: unknown,
  pedido: PedidoDeIA,
  fornecedor: FornecedorCompat,
  modelo: string,
): RespostaDeIA {
  const invalida = (motivo: string) => new ErroDeIA("resposta_invalida", `${fornecedor}/${modelo}: ${motivo}`);
  const escolha = (dados as { choices?: unknown[] })?.choices?.[0] as
    | { message?: { content?: unknown; tool_calls?: unknown[] }; finish_reason?: string }
    | undefined;
  if (!escolha?.message) throw invalida("resposta sem choices[0].message");

  const texto = typeof escolha.message.content === "string" ? escolha.message.content : "";
  const chamadas: ChamadaDeFerramenta[] = [];
  for (const bruta of escolha.message.tool_calls ?? []) {
    const c = bruta as {
      id?: unknown;
      function?: { name?: unknown; arguments?: unknown };
      extra_content?: { google?: { thought_signature?: unknown } };
    };
    if (typeof c.id !== "string" || typeof c.function?.name !== "string") throw invalida("tool_call sem id ou nome");
    const argumentos = typeof c.function.arguments === "string"
      ? extrairObjetoJson(c.function.arguments || "{}")
      : null;
    if (!argumentos) throw invalida(`argumentos da ferramenta ${c.function.name} não são um objeto JSON`);
    const assinatura = c.extra_content?.google?.thought_signature;
    chamadas.push({
      id: c.id,
      nome: c.function.name,
      argumentos,
      ...(fornecedor === "gemini" && typeof assinatura === "string" && assinatura ? { assinatura } : {}),
    });
  }

  if (pedido.ferramentaObrigatoria && !chamadas.some((c) => c.nome === pedido.ferramentaObrigatoria)) {
    throw invalida(`não chamou a ferramenta obrigatória ${pedido.ferramentaObrigatoria}`);
  }

  let json: Record<string, unknown> | undefined;
  if (pedido.json) {
    json = extrairObjetoJson(texto) ?? undefined;
    if (!json) throw invalida("saída JSON pedida, mas o conteúdo não é um objeto JSON");
  }

  const motivo = escolha.finish_reason;
  const fimPor = motivo === "length" ? "limite" : chamadas.length > 0 || motivo === "tool_calls" ? "ferramenta" : "fim";

  return {
    texto,
    chamadas,
    ...(json ? { json } : {}),
    fimPor,
    fornecedor,
    modelo,
    uso: usoCompat((dados as { usage?: Record<string, unknown> }).usage),
  };
}

// ─── Erros ───────────────────────────────────────────────────────────

/**
 * Refina a classificação base pelo corpo do erro. Lê só códigos e tipos
 * estruturados; o texto livre é examinado apenas para a chave inválida do
 * Gemini, que chega como 400 genérico.
 */
export function classificarErro(fornecedor: FornecedorCompat, status: number, corpo: string): ErroDeIA {
  const detalhe = `${fornecedor} respondeu HTTP ${status}`;
  let erro: Record<string, unknown> = {};
  try {
    const bruto = JSON.parse(corpo);
    // O Gemini às vezes devolve o erro dentro de uma lista.
    const objeto = Array.isArray(bruto) ? bruto[0] : bruto;
    erro = (objeto?.error ?? {}) as Record<string, unknown>;
  } catch {
    // corpo não-JSON: fica a classificação por status
  }
  const codigo = String(erro.code ?? "");
  const tipo = String(erro.type ?? "");
  const situacao = String(erro.status ?? "");

  if (codigo === "insufficient_quota" || tipo === "insufficient_quota") return new ErroDeIA("sem_saldo", detalhe);
  if (codigo === "invalid_api_key") return new ErroDeIA("chave_invalida", detalhe);
  if (
    fornecedor === "gemini" && status === 400 &&
    (situacao === "INVALID_ARGUMENT" || codigo === "400") && /api key/i.test(String(erro.message ?? ""))
  ) {
    return new ErroDeIA("chave_invalida", detalhe);
  }
  return erroPorStatusHttp(fornecedor, status);
}

// ─── Chamada ─────────────────────────────────────────────────────────

export const chamarOpenAICompat: Adaptador = async (chamada: ChamadaAoFornecedor): Promise<RespostaDeIA> => {
  const { fornecedor, chave, modelo, pedido } = chamada;
  if (fornecedor !== "openai" && fornecedor !== "gemini") {
    throw new TypeError(`Fornecedor ${fornecedor} não usa o adaptador openai_compat.`);
  }
  validarPedido(pedido);

  const fazerFetch = chamada.fetch ?? fetch;
  let resposta: Response;
  try {
    resposta = await fazerFetch(`${PERFIS[fornecedor].urlBase}/chat/completions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify(montarCorpo(pedido, modelo, fornecedor)),
      signal: AbortSignal.timeout(chamada.timeoutMs ?? TIMEOUT_PADRAO_MS),
    });
  } catch (e) {
    const tempo = e instanceof DOMException && e.name === "TimeoutError";
    throw new ErroDeIA("indisponivel", `${fornecedor}: ${tempo ? "tempo esgotado" : "falha de rede"}`, true);
  }

  if (!resposta.ok) {
    throw classificarErro(fornecedor, resposta.status, await resposta.text().catch(() => ""));
  }
  let dados: unknown;
  try {
    dados = await resposta.json();
  } catch {
    throw new ErroDeIA("resposta_invalida", `${fornecedor}/${modelo}: corpo não é JSON`);
  }
  return lerResposta(dados, pedido, fornecedor, modelo);
};
