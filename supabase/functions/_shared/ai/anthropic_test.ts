// Testes do adaptador da Anthropic (backlogs IA-07 e IA-08), com `fetch`
// simulado: nenhuma chamada de rede.
//
//   deno test --allow-read supabase/functions/_shared/ai/

import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { blocoDeImagem, chamarAnthropic, esquemaParaSaidaEstruturada, ID_SAIDA_ESTRUTURADA } from "./anthropic.ts";
import { ErroDeIA } from "./erros.ts";
import type { PedidoDeIA } from "./tipos.ts";

const CHAVE = "sk-ant-teste-0123456789abcdefWXYZ";
const IMAGEM = "data:image/png;base64,iVBORw0KGgo=";
/** Aceita `tool_choice` com nome. */
const ACEITA = "claude-haiku-5-5";
/** Recusa `tool_choice` com nome (400). */
const RECUSA = "claude-sonnet-5-5";

interface Capturado {
  url: string;
  headers: Headers;
  corpo: Record<string, unknown>;
}

function fetchFalso(status: number, corpo: unknown, capturado?: Capturado[]): typeof fetch {
  return ((url: string | URL | Request, init?: RequestInit) => {
    capturado?.push({ url: String(url), headers: new Headers(init?.headers), corpo: JSON.parse(String(init?.body)) });
    const texto = typeof corpo === "string" ? corpo : JSON.stringify(corpo);
    return Promise.resolve(new Response(texto, { status, headers: { "Content-Type": "application/json" } }));
  }) as typeof fetch;
}

function respostaOk(content: unknown[], stop = "end_turn", usage: Record<string, unknown> = {}) {
  return { content, stop_reason: stop, usage: { input_tokens: 100, output_tokens: 20, ...usage } };
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
  parametros: {
    type: "object" as const,
    properties: { nota: { type: "number", minimum: 0, maximum: 100 } },
    required: ["nota"],
  },
};
const outra = { nome: "buscar", descricao: "Busca", parametros: { type: "object" as const, properties: {} } };

async function chamar(p: PedidoDeIA, f: typeof fetch, modelo = ACEITA) {
  return await chamarAnthropic({ fornecedor: "anthropic", chave: CHAVE, modelo, pedido: p, fetch: f });
}

async function erroDe(promessa: Promise<unknown>): Promise<ErroDeIA> {
  return (await assertRejects(() => promessa, ErroDeIA)) as ErroDeIA;
}

Deno.test("URL fixa, x-api-key e versão; system de nível superior; limite com folga de raciocínio", async () => {
  const cap: Capturado[] = [];
  await chamar(pedido(), fetchFalso(200, respostaOk([{ type: "text", text: "oi" }]), cap));
  assertEquals(cap[0].url, "https://api.anthropic.com/v1/messages");
  assertEquals(cap[0].headers.get("x-api-key"), CHAVE);
  assertEquals(cap[0].headers.get("anthropic-version"), "2023-06-01");
  assertEquals(cap[0].headers.get("Authorization"), null);
  assertEquals(cap[0].corpo.system, "Você é um assistente.");
  assertEquals(cap[0].corpo.max_tokens, 8512);
  assertEquals(cap[0].corpo.temperature, undefined);
  assertEquals(cap[0].corpo.messages, [{ role: "user", content: [{ type: "text", text: "Olá" }] }]);
});

Deno.test("modelo que aceita: imagem, ferramenta obrigatória por tool_choice e histórico com papéis alternados", async () => {
  const cap: Capturado[] = [];
  const p = pedido({
    nivel: "visao",
    ferramentas: [ferramenta],
    ferramentaObrigatoria: "submit_scores",
    mensagens: [
      { papel: "usuario", conteudo: [{ tipo: "texto", texto: "Analise" }, { tipo: "imagem", dataUrl: IMAGEM }] },
      { papel: "assistente", texto: "", chamadas: [{ id: "tu_1", nome: "submit_scores", argumentos: { nota: 7 } }] },
      { papel: "resultados", resultados: [{ idChamada: "tu_1", nome: "submit_scores", conteudo: "ok" }] },
      { papel: "usuario", conteudo: "E agora?" },
    ],
  });
  const r = await chamar(p, fetchFalso(200, respostaOk([{ type: "tool_use", id: "tu_2", name: "submit_scores", input: { nota: 9 } }], "tool_use"), cap));
  assertEquals(r.chamadas, [{ id: "tu_2", nome: "submit_scores", argumentos: { nota: 9 } }]);

  const corpo = cap[0].corpo;
  // No tool_choice forçado o esquema vai como está.
  assertEquals(corpo.tools, [{ name: "submit_scores", description: "Envia as notas", input_schema: ferramenta.parametros }]);
  assertEquals(corpo.tool_choice, { type: "tool", name: "submit_scores" });
  assertEquals(corpo.output_config, undefined);
  assertEquals(corpo.messages, [
    {
      role: "user",
      content: [
        { type: "text", text: "Analise" },
        { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" } },
      ],
    },
    { role: "assistant", content: [{ type: "tool_use", id: "tu_1", name: "submit_scores", input: { nota: 7 } }] },
    {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "tu_1", content: "ok" },
        { type: "text", text: "E agora?" },
      ],
    },
  ]);
  assertEquals(blocoDeImagem("data:image/webp;base64,AAAA"), { type: "image", source: { type: "base64", media_type: "image/webp", data: "AAAA" } });
});

Deno.test("modelo que recusa, ferramenta única: vira saída estruturada e volta como chamada", async () => {
  const cap: Capturado[] = [];
  const r = await chamar(
    pedido({ ferramentas: [ferramenta], ferramentaObrigatoria: "submit_scores" }),
    fetchFalso(200, respostaOk([{ type: "text", text: "{\"nota\":8}" }])),
    RECUSA,
  );
  assertEquals(r.chamadas, [{ id: ID_SAIDA_ESTRUTURADA, nome: "submit_scores", argumentos: { nota: 8 } }]);
  assertEquals(r.fimPor, "ferramenta");

  await chamar(
    pedido({ ferramentas: [ferramenta], ferramentaObrigatoria: "submit_scores" }),
    fetchFalso(200, respostaOk([{ type: "text", text: "{\"nota\":8}" }]), cap),
    RECUSA,
  );
  const corpo = cap[0].corpo;
  assertEquals(corpo.tool_choice, undefined);
  assertEquals(corpo.tools, undefined);
  assertEquals(corpo.output_config, {
    format: {
      type: "json_schema",
      schema: { type: "object", properties: { nota: { type: "number" } }, required: ["nota"], additionalProperties: false },
    },
  });
});

Deno.test("modelo que recusa, várias ferramentas: auto com instrução; sem a chamada é resposta_invalida", async () => {
  const cap: Capturado[] = [];
  const p = pedido({ ferramentas: [ferramenta, outra], ferramentaObrigatoria: "submit_scores" });
  const r = await chamar(p, fetchFalso(200, respostaOk([{ type: "tool_use", id: "x", name: "submit_scores", input: { nota: 5 } }], "tool_use"), cap), RECUSA);
  assertEquals(r.chamadas[0].nome, "submit_scores");
  assertEquals(cap[0].corpo.tool_choice, undefined);
  assert(String(cap[0].corpo.system).endsWith("Responda chamando a ferramenta submit_scores."));
  assertEquals((cap[0].corpo.tools as unknown[]).length, 2);

  const erro = await erroDe(chamar(p, fetchFalso(200, respostaOk([{ type: "text", text: "não chamei" }])), RECUSA));
  assertEquals(erro.codigo, "resposta_invalida");
});

Deno.test("saída JSON usa output_config.format em qualquer modelo; o objeto volta em `json`", async () => {
  const esquema = {
    type: "object" as const,
    properties: { resumo: { type: "string", maxLength: 500 }, itens: { type: "array", maxItems: 3, items: { type: "object", properties: { t: { type: "string" } } } } },
    required: ["resumo"],
  };
  for (const modelo of [ACEITA, RECUSA]) {
    const cap: Capturado[] = [];
    const r = await chamar(
      pedido({ json: { nome: "resumo", esquema } }),
      fetchFalso(200, respostaOk([{ type: "text", text: "{\"resumo\":\"ok\",\"itens\":[]}" }]), cap),
      modelo,
    );
    assertEquals([r.json, r.chamadas, r.fimPor], [{ resumo: "ok", itens: [] }, [], "fim"]);
    assertEquals(cap[0].corpo.tools, undefined);
    assertEquals(cap[0].corpo.tool_choice, undefined);
    assertEquals(cap[0].corpo.output_config, {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            resumo: { type: "string" },
            itens: { type: "array", items: { type: "object", properties: { t: { type: "string" } }, additionalProperties: false } },
          },
          required: ["resumo"],
          additionalProperties: false,
        },
      },
    });
  }
});

Deno.test("esquema: fecha objetos aninhados, preserva nomes de propriedade que parecem palavra-chave", () => {
  const ajustado = esquemaParaSaidaEstruturada({
    type: "object",
    properties: { minimum: { type: "number", minimum: 1 }, sub: { properties: { a: { type: "string" } } } },
    anyOf: [{ type: "object", properties: {} }],
  });
  assertEquals(ajustado, {
    type: "object",
    properties: {
      minimum: { type: "number" },
      sub: { properties: { a: { type: "string" } }, additionalProperties: false },
    },
    anyOf: [{ type: "object", properties: {}, additionalProperties: false }],
    additionalProperties: false,
  });
});

Deno.test("resposta: texto, chamadas, motivo do fim e uso com leitura e gravação de cache", async () => {
  const texto = await chamar(pedido(), fetchFalso(200, respostaOk(
    [{ type: "text", text: "Olá" }, { type: "text", text: "!" }],
    "end_turn",
    { cache_read_input_tokens: 30, cache_creation_input_tokens: 10 },
  )));
  assertEquals([texto.texto, texto.fimPor, texto.fornecedor, texto.modelo], ["Olá!", "fim", "anthropic", ACEITA]);
  assertEquals(texto.uso, { entrada: 100, saida: 20, entradaCache: 30, escritaCache: 10 });

  const ferr = await chamar(
    pedido({ ferramentas: [ferramenta] }),
    fetchFalso(200, respostaOk([{ type: "text", text: "Vou chamar" }, { type: "tool_use", id: "x", name: "submit_scores", input: { nota: 8 } }], "tool_use")),
    RECUSA,
  );
  assertEquals(ferr.chamadas, [{ id: "x", nome: "submit_scores", argumentos: { nota: 8 } }]);
  assertEquals([ferr.texto, ferr.fimPor], ["Vou chamar", "ferramenta"]);

  const cortada = await chamar(pedido(), fetchFalso(200, respostaOk([{ type: "text", text: "Era uma" }], "max_tokens")));
  assertEquals(cortada.fimPor, "limite");
});

Deno.test("resposta fora do combinado ou recusa do modelo viram resposta_invalida", async () => {
  const forcada = pedido({ ferramentas: [ferramenta], ferramentaObrigatoria: "submit_scores" });
  const comJson = pedido({ json: { nome: "r", esquema: { type: "object", properties: {} } } });
  const casos: [PedidoDeIA, unknown, string][] = [
    [pedido(), { content: "texto" }, ACEITA],
    [pedido(), "isto não é json", ACEITA],
    [pedido(), respostaOk([{ type: "text", text: "" }], "refusal"), ACEITA],
    [forcada, respostaOk([{ type: "text", text: "não chamei" }]), ACEITA],
    [forcada, respostaOk([{ type: "tool_use", id: "a", name: "submit_scores", input: "quebrado" }], "tool_use"), ACEITA],
    [forcada, respostaOk([{ type: "text", text: "{\"nota\":" }], "max_tokens"), RECUSA],
    [comJson, respostaOk([{ type: "text", text: "texto solto" }]), RECUSA],
  ];
  for (const [p, corpo, modelo] of casos) {
    const erro = await erroDe(chamar(p, fetchFalso(200, corpo), modelo));
    assertEquals([erro.codigo, erro.tentarDeNovo], ["resposta_invalida", false]);
  }
});

Deno.test("erros HTTP pela estrutura de erro da Anthropic — e nunca o corpo na mensagem", async () => {
  const eco = `invalid x-api-key ${CHAVE}`;
  const erroAnt = (type: string, message = "x") => ({ type: "error", error: { type, message } });
  const casos: [number, unknown, string, boolean][] = [
    [401, erroAnt("authentication_error", eco), "chave_invalida", false],
    [403, erroAnt("permission_error"), "chave_invalida", false],
    [400, erroAnt("invalid_request_error", "Your credit balance is too low to access the Anthropic API."), "sem_saldo", false],
    [402, erroAnt("billing_error"), "sem_saldo", false],
    [400, erroAnt("invalid_request_error", "tool_choice: type \"tool\" and \"any\" are not supported for this model."), "resposta_invalida", false],
    [404, erroAnt("not_found_error", "model: modelo-a"), "resposta_invalida", false],
    [429, erroAnt("rate_limit_error"), "limite_taxa", true],
    [529, erroAnt("overloaded_error"), "indisponivel", true],
    [500, erroAnt("api_error"), "indisponivel", true],
    [502, "<html>Bad Gateway</html>", "indisponivel", true],
  ];
  for (const [status, corpo, codigo, tentar] of casos) {
    const erro = await erroDe(chamar(pedido(), fetchFalso(status, corpo)));
    assertEquals([erro.codigo, erro.tentarDeNovo], [codigo, tentar], `HTTP ${status}`);
    assert(!erro.message.includes(CHAVE) && !erro.message.includes("credit"), "mensagem interna sem o corpo");
  }
});

Deno.test("tempo esgotado e falha de rede viram indisponivel; pedido incoerente e fornecedor errado não chegam à rede", async () => {
  const tempo = (() => Promise.reject(new DOMException("tempo", "TimeoutError"))) as typeof fetch;
  const rede = (() => Promise.reject(new TypeError("connection refused"))) as typeof fetch;
  for (const f of [tempo, rede]) {
    const erro = await erroDe(chamar(pedido(), f));
    assertEquals([erro.codigo, erro.tentarDeNovo], ["indisponivel", true]);
  }

  let chamou = false;
  const espiao = (() => {
    chamou = true;
    return Promise.resolve(new Response("{}"));
  }) as typeof fetch;
  await assertRejects(() => chamar(pedido({ maxTokens: 0 }), espiao), TypeError);
  await assertRejects(
    () => chamarAnthropic({ fornecedor: "openai", chave: CHAVE, modelo: "m", pedido: pedido(), fetch: espiao }),
    TypeError,
  );
  assert(!chamou);
});
