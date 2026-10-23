// Testes da interface neutra e dos erros da camada de IA (backlog IA-05).
//
//   deno test --allow-read supabase/functions/_shared/ai/
//
// `--allow-read`: o último teste lê a migration 0031 para conferir que os
// códigos e listas daqui são os mesmos dos `check` do banco.

import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { exigeVisao, FORNECEDORES, NIVEIS, type PedidoDeIA, validarPedido } from "./tipos.ts";
import {
  BLOQUEIOS,
  corpoDeErro,
  ERROS_DO_FORNECEDOR,
  ErroDeIA,
  erroDeBloqueio,
  erroPorStatusHttp,
  respostaDeErro,
} from "./erros.ts";

const IMAGEM = "data:image/png;base64,iVBORw0KGgo=";

function pedido(extra: Partial<PedidoDeIA> = {}): PedidoDeIA {
  return {
    funcionalidade: "score-leads",
    nivel: "padrao",
    mensagens: [{ papel: "usuario", conteudo: "Olá" }],
    maxTokens: 1024,
    ...extra,
  };
}

const ferramenta = {
  nome: "submit_scores",
  descricao: "Envia as notas",
  parametros: { type: "object" as const, properties: {} },
};

Deno.test("pedido coerente passa; com imagem exige o nível visao", () => {
  validarPedido(pedido());
  validarPedido(pedido({ ferramentas: [ferramenta], ferramentaObrigatoria: "submit_scores" }));
  validarPedido(pedido({ json: { nome: "resumo", esquema: { type: "object", properties: {} } } }));

  const comImagem = pedido({
    nivel: "visao",
    mensagens: [{ papel: "usuario", conteudo: [{ tipo: "texto", texto: "Analise" }, { tipo: "imagem", dataUrl: IMAGEM }] }],
  });
  assert(exigeVisao(comImagem));
  validarPedido(comImagem);
  assert(!exigeVisao(pedido()));
});

Deno.test("pedido incoerente é recusado antes de gastar uma chamada", () => {
  const recusa = (p: PedidoDeIA) => assertThrows(() => validarPedido(p), TypeError);

  recusa(pedido({ funcionalidade: "  " }));
  recusa(pedido({ nivel: "turbo" as never }));
  recusa(pedido({ mensagens: [] }));
  recusa(pedido({ mensagens: [{ papel: "assistente", texto: "oi" }] }));
  recusa(pedido({ maxTokens: 0 }));
  recusa(pedido({ maxTokens: 1.5 }));
  recusa(pedido({ maxTokens: 64_000 }));
  recusa(pedido({ ferramentaObrigatoria: "submit_scores" }));
  recusa(pedido({ ferramentas: [ferramenta, ferramenta] }));
  recusa(pedido({ ferramentas: [{ ...ferramenta, nome: "com espaço" }] }));
  recusa(pedido({
    ferramentas: [ferramenta],
    json: { nome: "resumo", esquema: { type: "object", properties: {} } },
  }));
  recusa(pedido({ mensagens: [{ papel: "usuario", conteudo: [{ tipo: "imagem", dataUrl: IMAGEM }] }] }));
  recusa(pedido({
    nivel: "visao",
    mensagens: [{ papel: "usuario", conteudo: [{ tipo: "imagem", dataUrl: "https://exemplo.com/a.png" }] }],
  }));
});

Deno.test("status HTTP do fornecedor vira código neutro; só falha transitória tenta de novo", () => {
  const casos: [number, string, boolean][] = [
    [401, "chave_invalida", false],
    [403, "chave_invalida", false],
    [402, "sem_saldo", false],
    [429, "limite_taxa", true],
    [408, "indisponivel", true],
    [500, "indisponivel", true],
    [529, "indisponivel", true],
    [400, "resposta_invalida", false],
    [404, "resposta_invalida", false],
  ];
  for (const [status, codigo, tentar] of casos) {
    const erro = erroPorStatusHttp("openai", status);
    assertEquals([erro.codigo, erro.tentarDeNovo], [codigo, tentar], `HTTP ${status}`);
    assert(erro.daCredencial);
  }
});

Deno.test("mensagem ao usuário não cita fornecedor; chave do cliente com falha pede o suporte (Q3)", () => {
  for (const codigo of [...ERROS_DO_FORNECEDOR, ...BLOQUEIOS]) {
    const erro = new ErroDeIA(codigo, "anthropic respondeu HTTP 500");
    assert(!/openai|gemini|anthropic|claude|gpt|http/i.test(erro.mensagemAoUsuario), codigo);
    assert(erro.status >= 400 && erro.status < 600, codigo);
  }
  assertEquals(
    new ErroDeIA("chave_invalida", "x").mensagemAoUsuario,
    "Não foi possível usar a IA da sua organização no momento. Entre em contato com o suporte.",
  );
  const bloqueio = erroDeBloqueio("orcamento_esgotado");
  assert(!bloqueio.tentarDeNovo && !bloqueio.daCredencial);
  assertEquals(bloqueio.status, 402);
});

Deno.test("corpo de erro mantém `error` em texto, como o portal lê hoje, e acrescenta `codigo`", async () => {
  const erro = new ErroDeIA("limite_taxa", "gemini respondeu HTTP 429", true);
  assertEquals(corpoDeErro(erro), { error: erro.mensagemAoUsuario, codigo: "limite_taxa" });

  const resposta = respostaDeErro(erro, { "Access-Control-Allow-Origin": "*" });
  assertEquals(resposta.status, 429);
  assertEquals(resposta.headers.get("Access-Control-Allow-Origin"), "*");
  assertEquals(await resposta.json(), { error: erro.mensagemAoUsuario, codigo: "limite_taxa" });
  // A mensagem interna (log) não vaza para o corpo.
  assert(!JSON.stringify(corpoDeErro(erro)).includes("HTTP 429"));
});

Deno.test("códigos e listas batem com os `check` da migration 0031", async () => {
  const sql = await Deno.readTextFile(new URL("../../../migrations/0031_ia_por_organizacao.sql", import.meta.url));
  const lista = (constraint: string): string[] => {
    const inicio = sql.indexOf(`constraint ${constraint} check`);
    assert(inicio >= 0, constraint);
    // A lista do `in (...)` não tem parênteses dentro: vai até o primeiro ")".
    const abre = sql.indexOf(" in (", inicio) + 5;
    const dentroDoIn = sql.slice(abre, sql.indexOf(")", abre));
    return [...dentroDoIn.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  };

  assertEquals(lista("ai_usage_events_error_code_check"), [...ERROS_DO_FORNECEDOR, ...BLOQUEIOS].sort());
  assertEquals(lista("ai_credentials_last_error_check"), [...ERROS_DO_FORNECEDOR].sort());
  assertEquals(lista("ai_credentials_provider_check"), [...FORNECEDORES].sort());
  assertEquals(lista("ai_usage_events_tier_check"), [...NIVEIS].sort());
  assertEquals(lista("ai_usage_events_scope_check"), ["exclusiva", "padrao", "semente", "via_padrao"]);
});
