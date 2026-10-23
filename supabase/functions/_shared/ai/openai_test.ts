// Testes do adaptador openai_compat (backlog IA-06), com `fetch` simulado:
// nenhuma chamada de rede. Cobre as linhas OpenAI e Gemini da tabela do
// plano §3.1.
//
//   deno test --allow-read supabase/functions/_shared/ai/

import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { chamarOpenAICompat } from "./openai.ts";
import { extrairObjetoJson } from "./tipos.ts";
import { ErroDeIA } from "./erros.ts";
import type { Fornecedor, PedidoDeIA } from "./tipos.ts";

const CHAVE = "sk-teste-0123456789abcdefWXYZ";
const IMAGEM = "data:image/png;base64,iVBORw0KGgo=";

interface Capturado {
  url: string;
  headers: Headers;
  corpo: Record<string, unknown>;
}

function fetchFalso(status: number, corpo: unknown, capturado?: Capturado[]): typeof fetch {
  return ((url: string | URL | Request, init?: RequestInit) => {
    capturado?.push({
      url: String(url),
      headers: new Headers(init?.headers),
      corpo: JSON.parse(String(init?.body)),
    });
    const texto = typeof corpo === "string" ? corpo : JSON.stringify(corpo);
    return Promise.resolve(new Response(texto, { status, headers: { "Content-Type": "application/json" } }));
  }) as typeof fetch;
}

function respostaOk(message: Record<string, unknown>, finish = "stop", usage: Record<string, unknown> = {}) {
  return { choices: [{ message, finish_reason: finish }], usage: { prompt_tokens: 100, completion_tokens: 20, ...usage } };
}

function pedido(extra: Partial<PedidoDeIA> = {}): PedidoDeIA {
  return {
    funcionalidade: "teste",
    nivel: "padrao",
    sistema: "Você é um assistente.",
    mensagens: [{ papel: "usuario", conteudo: "Olá" }],
    maxTokens: 512,
    ...extra,
  };
}

const ferramenta = {
  nome: "submit_scores",
  descricao: "Envia as notas",
  parametros: { type: "object" as const, properties: { nota: { type: "number" } }, required: ["nota"] },
};

async function chamar(fornecedor: Fornecedor, p: PedidoDeIA, f: typeof fetch) {
  return await chamarOpenAICompat({ fornecedor, chave: CHAVE, modelo: "modelo-x", pedido: p, fetch: f });
}

async function codigoDoErro(promessa: Promise<unknown>): Promise<ErroDeIA> {
  return (await assertRejects(() => promessa, ErroDeIA)) as ErroDeIA;
}

Deno.test("URL base fixa e autenticação Bearer, por fornecedor", async () => {
  const cap: Capturado[] = [];
  await chamar("openai", pedido(), fetchFalso(200, respostaOk({ content: "oi" }), cap));
  await chamar("gemini", pedido(), fetchFalso(200, respostaOk({ content: "oi" }), cap));
  assertEquals(cap[0].url, "https://api.openai.com/v1/chat/completions");
  assertEquals(cap[1].url, "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
  for (const c of cap) assertEquals(c.headers.get("Authorization"), `Bearer ${CHAVE}`);
  // Limite de saída: OpenAI recusa `max_tokens` nos modelos novos.
  // Limite com a folga de raciocínio (512 + 8000).
  assertEquals(cap[0].corpo.max_completion_tokens, 8512);
  assertEquals(cap[0].corpo.max_tokens, undefined);
  assertEquals(cap[1].corpo.max_tokens, 8512);
  assertEquals(cap[0].corpo.temperature, undefined);
});

Deno.test("pedido: sistema, imagem, ferramentas, ferramenta obrigatória e histórico com resultados", async () => {
  const cap: Capturado[] = [];
  const p = pedido({
    nivel: "visao",
    ferramentas: [ferramenta],
    ferramentaObrigatoria: "submit_scores",
    mensagens: [
      { papel: "usuario", conteudo: [{ tipo: "texto", texto: "Analise" }, { tipo: "imagem", dataUrl: IMAGEM }] },
      { papel: "assistente", texto: "Vou chamar", chamadas: [{ id: "call_1", nome: "submit_scores", argumentos: { nota: 7 } }] },
      { papel: "resultados", resultados: [{ idChamada: "call_1", nome: "submit_scores", conteudo: "ok" }] },
      { papel: "usuario", conteudo: "E agora?" },
    ],
  });
  const resposta = respostaOk({ content: null, tool_calls: [{ id: "call_2", type: "function", function: { name: "submit_scores", arguments: "{\"nota\":9}" } }] }, "tool_calls");
  await chamar("openai", p, fetchFalso(200, resposta, cap));

  const corpo = cap[0].corpo;
  assertEquals(corpo.model, "modelo-x");
  assertEquals(corpo.tool_choice, { type: "function", function: { name: "submit_scores" } });
  assertEquals(corpo.tools, [{ type: "function", function: { name: "submit_scores", description: "Envia as notas", parameters: ferramenta.parametros } }]);
  assertEquals(corpo.messages, [
    { role: "system", content: "Você é um assistente." },
    { role: "user", content: [{ type: "text", text: "Analise" }, { type: "image_url", image_url: { url: IMAGEM } }] },
    { role: "assistant", content: "Vou chamar", tool_calls: [{ id: "call_1", type: "function", function: { name: "submit_scores", arguments: "{\"nota\":7}" } }] },
    { role: "tool", tool_call_id: "call_1", content: "ok" },
    { role: "user", content: "E agora?" },
  ]);
});

Deno.test("resposta: texto, chamadas com argumentos, motivo do fim e uso com cache separado", async () => {
  const texto = await chamar("openai", pedido(), fetchFalso(200, respostaOk({ content: "Olá!" }, "stop", { prompt_tokens: 100, prompt_tokens_details: { cached_tokens: 30 } })));
  assertEquals([texto.texto, texto.fimPor, texto.fornecedor, texto.modelo], ["Olá!", "fim", "openai", "modelo-x"]);
  assertEquals(texto.uso, { entrada: 70, saida: 20, entradaCache: 30, escritaCache: 0 });

  const ferr = await chamar(
    "gemini",
    pedido({ ferramentas: [ferramenta], ferramentaObrigatoria: "submit_scores" }),
    // O Gemini responde finish_reason "stop" mesmo chamando ferramenta, e sem detalhes de cache.
    fetchFalso(200, respostaOk({ content: "", tool_calls: [{ id: "a", type: "function", function: { name: "submit_scores", arguments: "{\"nota\":8}" } }] }, "stop")),
  );
  assertEquals(ferr.chamadas, [{ id: "a", nome: "submit_scores", argumentos: { nota: 8 } }]);
  assertEquals(ferr.fimPor, "ferramenta");
  assertEquals(ferr.uso, { entrada: 100, saida: 20, entradaCache: 0, escritaCache: 0 });

  const cortada = await chamar("openai", pedido(), fetchFalso(200, respostaOk({ content: "Era uma vez" }, "length")));
  assertEquals(cortada.fimPor, "limite");
});

Deno.test("saída JSON: json_schema no pedido, objeto lido mesmo com cerca de markdown", async () => {
  const cap: Capturado[] = [];
  const esquema = { type: "object" as const, properties: { resumo: { type: "string" } }, required: ["resumo"] };
  const r = await chamar(
    "gemini",
    pedido({ json: { nome: "resumo", esquema } }),
    fetchFalso(200, respostaOk({ content: "```json\n{\"resumo\":\"ok\"}\n```" }), cap),
  );
  assertEquals(r.json, { resumo: "ok" });
  assertEquals(cap[0].corpo.response_format, { type: "json_schema", json_schema: { name: "resumo", schema: esquema } });
  const sistema = (cap[0].corpo.messages as { content: string }[])[0].content;
  assert(sistema.startsWith("Você é um assistente.") && sistema.includes("objeto JSON"));

  assertEquals(extrairObjetoJson("[1,2]"), null);
  assertEquals(extrairObjetoJson("nada"), null);
});

Deno.test("resposta fora do combinado vira resposta_invalida", async () => {
  const comFerramenta = pedido({ ferramentas: [ferramenta], ferramentaObrigatoria: "submit_scores" });
  const casos: [PedidoDeIA, unknown][] = [
    [pedido(), { choices: [] }],
    [pedido(), "isto não é json"],
    [comFerramenta, respostaOk({ content: "não chamei" })],
    [comFerramenta, respostaOk({ tool_calls: [{ id: "a", function: { name: "submit_scores", arguments: "{quebrado" } }] })],
    [pedido({ json: { nome: "r", esquema: { type: "object", properties: {} } } }), respostaOk({ content: "texto solto" })],
  ];
  for (const [p, corpo] of casos) {
    const erro = await codigoDoErro(chamar("openai", p, fetchFalso(200, corpo)));
    assertEquals(erro.codigo, "resposta_invalida");
    assert(!erro.tentarDeNovo);
  }
});

Deno.test("erros HTTP: chave, saldo, limite, indisponível — e nunca o corpo na mensagem", async () => {
  const eco = `Incorrect API key provided: ${CHAVE}`;
  const casos: [Fornecedor, number, unknown, string, boolean][] = [
    ["openai", 401, { error: { message: eco, type: "invalid_request_error", code: "invalid_api_key" } }, "chave_invalida", false],
    ["openai", 429, { error: { message: "quota", type: "insufficient_quota", code: "insufficient_quota" } }, "sem_saldo", false],
    ["openai", 429, { error: { message: "Rate limit", type: "requests", code: "rate_limit_exceeded" } }, "limite_taxa", true],
    ["openai", 404, { error: { message: "model not found", code: "model_not_found" } }, "resposta_invalida", false],
    ["openai", 503, "<html>Service Unavailable</html>", "indisponivel", true],
    ["gemini", 400, [{ error: { code: 400, message: `API key not valid. ${eco}`, status: "INVALID_ARGUMENT" } }], "chave_invalida", false],
    ["gemini", 400, [{ error: { code: 400, message: "Invalid JSON payload", status: "INVALID_ARGUMENT" } }], "resposta_invalida", false],
    ["gemini", 429, [{ error: { code: 429, message: "Resource exhausted", status: "RESOURCE_EXHAUSTED" } }], "limite_taxa", true],
    ["gemini", 403, { error: { code: 403, status: "PERMISSION_DENIED" } }, "chave_invalida", false],
  ];
  for (const [fornecedor, status, corpo, codigo, tentar] of casos) {
    const erro = await codigoDoErro(chamar(fornecedor, pedido(), fetchFalso(status, corpo)));
    assertEquals([erro.codigo, erro.tentarDeNovo], [codigo, tentar], `${fornecedor} ${status}`);
    assert(!erro.message.includes(CHAVE) && !erro.message.includes("Incorrect"), "mensagem interna sem o corpo");
  }
});

Deno.test("tempo esgotado e falha de rede viram indisponivel, com nova tentativa", async () => {
  const tempo = (() => Promise.reject(new DOMException("tempo", "TimeoutError"))) as typeof fetch;
  const rede = (() => Promise.reject(new TypeError("connection refused"))) as typeof fetch;
  for (const f of [tempo, rede]) {
    const erro = await codigoDoErro(chamar("openai", pedido(), f));
    assertEquals([erro.codigo, erro.tentarDeNovo], ["indisponivel", true]);
  }
});

Deno.test("pedido incoerente e fornecedor errado falham antes da rede", async () => {
  let chamou = false;
  const espiao = (() => {
    chamou = true;
    return Promise.resolve(new Response("{}"));
  }) as typeof fetch;
  await assertRejects(() => chamar("openai", pedido({ maxTokens: 0 }), espiao), TypeError);
  await assertRejects(() => chamar("anthropic", pedido(), espiao), TypeError);
  assert(!chamou);
});
