// Testes do adaptador da Anthropic (backlog IA-07), com `fetch` simulado:
// nenhuma chamada de rede. Equivalentes aos do openai_compat.
//
//   deno test --allow-read supabase/functions/_shared/ai/

import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { blocoDeImagem, chamarAnthropic } from "./anthropic.ts";
import { ErroDeIA } from "./erros.ts";
import type { PedidoDeIA } from "./tipos.ts";

const CHAVE = "sk-ant-teste-0123456789abcdefWXYZ";
const IMAGEM = "data:image/png;base64,iVBORw0KGgo=";

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
  parametros: { type: "object" as const, properties: { nota: { type: "number" } }, required: ["nota"] },
};

async function chamar(p: PedidoDeIA, f: typeof fetch) {
  return await chamarAnthropic({ fornecedor: "anthropic", chave: CHAVE, modelo: "modelo-a", pedido: p, fetch: f });
}

async function erroDe(promessa: Promise<unknown>): Promise<ErroDeIA> {
  return (await assertRejects(() => promessa, ErroDeIA)) as ErroDeIA;
}

Deno.test("URL fixa, x-api-key e versão da API; system de nível superior", async () => {
  const cap: Capturado[] = [];
  await chamar(pedido(), fetchFalso(200, respostaOk([{ type: "text", text: "oi" }]), cap));
  assertEquals(cap[0].url, "https://api.anthropic.com/v1/messages");
  assertEquals(cap[0].headers.get("x-api-key"), CHAVE);
  assertEquals(cap[0].headers.get("anthropic-version"), "2023-06-01");
  assertEquals(cap[0].headers.get("Authorization"), null);
  assertEquals(cap[0].corpo.system, "Você é um assistente.");
  assertEquals(cap[0].corpo.max_tokens, 512);
  assertEquals(cap[0].corpo.messages, [{ role: "user", content: [{ type: "text", text: "Olá" }] }]);
});

Deno.test("pedido: imagem em base64, ferramentas, obrigatória e histórico com papéis alternados", async () => {
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
  await chamar(p, fetchFalso(200, respostaOk([{ type: "tool_use", id: "tu_2", name: "submit_scores", input: { nota: 9 } }], "tool_use"), cap));

  const corpo = cap[0].corpo;
  assertEquals(corpo.tools, [{ name: "submit_scores", description: "Envia as notas", input_schema: ferramenta.parametros }]);
  assertEquals(corpo.tool_choice, { type: "tool", name: "submit_scores" });
  assertEquals(corpo.messages, [
    {
      role: "user",
      content: [
        { type: "text", text: "Analise" },
        { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" } },
      ],
    },
    // Texto vazio do assistente não vira bloco (a API recusa).
    { role: "assistant", content: [{ type: "tool_use", id: "tu_1", name: "submit_scores", input: { nota: 7 } }] },
    // Resultados e a pergunta seguinte numa única mensagem do usuário.
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

Deno.test("resposta: texto, chamadas, motivo do fim e uso com leitura e gravação de cache", async () => {
  const texto = await chamar(pedido(), fetchFalso(200, respostaOk(
    [{ type: "text", text: "Olá" }, { type: "text", text: "!" }],
    "end_turn",
    { cache_read_input_tokens: 30, cache_creation_input_tokens: 10 },
  )));
  assertEquals([texto.texto, texto.fimPor, texto.fornecedor, texto.modelo], ["Olá!", "fim", "anthropic", "modelo-a"]);
  assertEquals(texto.uso, { entrada: 100, saida: 20, entradaCache: 30, escritaCache: 10 });

  const ferr = await chamar(
    pedido({ ferramentas: [ferramenta] }),
    fetchFalso(200, respostaOk([{ type: "text", text: "Vou chamar" }, { type: "tool_use", id: "x", name: "submit_scores", input: { nota: 8 } }], "tool_use")),
  );
  assertEquals(ferr.chamadas, [{ id: "x", nome: "submit_scores", argumentos: { nota: 8 } }]);
  assertEquals([ferr.texto, ferr.fimPor], ["Vou chamar", "ferramenta"]);

  const cortada = await chamar(pedido(), fetchFalso(200, respostaOk([{ type: "text", text: "Era uma" }], "max_tokens")));
  assertEquals(cortada.fimPor, "limite");
});

Deno.test("saída JSON vira ferramenta obrigatória interna; o objeto volta em `json`, sem chamadas", async () => {
  const cap: Capturado[] = [];
  const esquema = { type: "object" as const, properties: { resumo: { type: "string" } }, required: ["resumo"] };
  const r = await chamar(
    pedido({ json: { nome: "resumo", esquema } }),
    fetchFalso(200, respostaOk([{ type: "tool_use", id: "j", name: "resumo", input: { resumo: "ok" } }], "tool_use"), cap),
  );
  assertEquals(r.json, { resumo: "ok" });
  assertEquals(r.chamadas, []);
  assertEquals(r.fimPor, "fim");
  assertEquals(cap[0].corpo.tool_choice, { type: "tool", name: "resumo" });
  assertEquals((cap[0].corpo.tools as { input_schema: unknown }[])[0].input_schema, esquema);
});

Deno.test("resposta fora do combinado vira resposta_invalida", async () => {
  const comFerramenta = pedido({ ferramentas: [ferramenta], ferramentaObrigatoria: "submit_scores" });
  const comJson = pedido({ json: { nome: "r", esquema: { type: "object", properties: {} } } });
  const casos: [PedidoDeIA, unknown][] = [
    [pedido(), { content: "texto" }],
    [pedido(), "isto não é json"],
    [comFerramenta, respostaOk([{ type: "text", text: "não chamei" }])],
    [comFerramenta, respostaOk([{ type: "tool_use", id: "a", name: "submit_scores", input: "quebrado" }], "tool_use")],
    [comJson, respostaOk([{ type: "text", text: "texto solto" }])],
    [comJson, respostaOk([{ type: "text", text: "cortado" }], "max_tokens")],
  ];
  for (const [p, corpo] of casos) {
    const erro = await erroDe(chamar(p, fetchFalso(200, corpo)));
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
    [400, erroAnt("invalid_request_error", "messages: roles must alternate"), "resposta_invalida", false],
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
