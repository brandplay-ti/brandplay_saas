// O CI roda `deno test --allow-read supabase/functions/_shared/`. O token
// entra por argumento: o teste não lê o ambiente.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  camposDaRequisicao,
  camposDaResposta,
  chavesDoJson,
  linhaFim,
  linhaInicio,
  logContexto,
  MetricasEdge,
  responderMetricas,
  sanitizarFuncao,
  tokensIguais,
} from "./observabilidade.ts";

Deno.test("o log guarda o nome do campo e descarta o valor", () => {
  const chaves = chavesDoJson(
    JSON.stringify({ nome: "Acme", password: "segredo", organization_id: "nao-e-logado-aqui" }),
  );
  assertEquals(chaves, ["nome", "organization_id", "password"]);
  const linha = linhaInicio({
    request_id: "req-1",
    funcao: "admin-plans",
    metodo: "POST",
    campos: chaves,
    consulta: [],
  });
  assert(!linha.includes("segredo"));
  assert(!linha.includes("Acme"));
  const evento = JSON.parse(linha);
  assertEquals(evento.evento, "request.inicio");
  assertEquals(evento.funcao, "admin-plans");
  assertEquals(evento.request_id, "req-1");
});

Deno.test("json inválido, lista e corpo grande têm marcas estáveis", () => {
  assertEquals(chavesDoJson("não-json"), []);
  assertEquals(chavesDoJson("[1,2]"), ["lista"]);
  assertEquals(chavesDoJson("x".repeat(70_000)), ["corpo-acima-de-64kb"]);
});

Deno.test("a request JSON expõe só as chaves, e a resposta também", async () => {
  const req = new Request("http://localhost/admin-plans?token=nao-entra", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer segredo" },
    body: JSON.stringify({ plan: { id: "pro" }, comment: "motivo" }),
  });
  assertEquals(await camposDaRequisicao(req), ["comment", "plan"]);
  const res = new Response(JSON.stringify({ plan: { id: "pro" }, stripe: "ok" }), {
    headers: { "content-type": "application/json" },
  });
  assertEquals(await camposDaResposta(res), ["plan", "stripe"]);
  const pdf = new Response("%PDF", { headers: { "content-type": "application/pdf" } });
  assertEquals(await camposDaResposta(pdf), []);
});

Deno.test("nome de função fora do padrão não vira rótulo de métrica", () => {
  assertEquals(sanitizarFuncao("saude"), "saude");
  assertEquals(sanitizarFuncao("../etc"), "invalida");
  assertEquals(sanitizarFuncao('admin"plans'), "invalida");
});

Deno.test("o fim da request carrega status, duração e os dois conjuntos de campos", () => {
  const linha = linhaFim({
    request_id: "req-2",
    funcao: "saude",
    metodo: "GET",
    campos: [],
    consulta: [],
    status: 200,
    duracao_ms: 12,
    campos_saida: ["status"],
  });
  const evento = JSON.parse(linha);
  assertEquals(evento.evento, "request.fim");
  assertEquals(evento.status, 200);
  assertEquals(evento.duracao_ms, 12);
  assertEquals(evento.campos_saida, ["status"]);
});

Deno.test("contexto só aceita uuid e código curto", () => {
  const linhas: string[] = [];
  const req = new Request("http://localhost/x", { headers: { "x-request-id": "req-3" } });
  logContexto(
    req,
    {
      user_id: "2a000000-0000-4000-8000-00000000000a",
      organization_id: "não-uuid",
      code: "acesso negado com detalhe demais " + "x".repeat(80),
    },
    (linha) => linhas.push(linha),
  );
  const evento = JSON.parse(linhas[0]);
  assertEquals(evento.evento, "request.contexto");
  assertEquals(evento.request_id, "req-3");
  assertEquals(evento.user_id, "2a000000-0000-4000-8000-00000000000a");
  assertEquals(evento.organization_id, undefined);
  assertEquals(evento.code, undefined);
});

Deno.test("histograma e contador saem no texto do Prometheus", () => {
  const metricas = new MetricasEdge();
  metricas.registrar("saude", 200, 40);
  metricas.registrar("saude", 500, 1200);
  metricas.registrar("../etc", 200, 10);
  const texto = metricas.prometheus();
  assert(texto.includes('brandplay_edge_requests_total{funcao="saude",status="200"} 1'));
  assert(texto.includes('brandplay_edge_requests_total{funcao="saude",status="500"} 1'));
  assert(texto.includes('brandplay_edge_requests_total{funcao="invalida",status="200"} 1'));
  assert(texto.includes('brandplay_edge_request_duration_ms_bucket{funcao="saude",le="50"} 1'));
  assert(texto.includes('brandplay_edge_request_duration_ms_bucket{funcao="saude",le="1000"} 1'));
  assert(texto.includes('brandplay_edge_request_duration_ms_bucket{funcao="saude",le="2500"} 2'));
  assert(texto.includes('brandplay_edge_request_duration_ms_bucket{funcao="saude",le="+Inf"} 2'));
  assert(texto.includes('brandplay_edge_request_duration_ms_count{funcao="saude"} 2'));
});

Deno.test("métricas exigem o token e ficam desligadas sem ele", async () => {
  const pedido = () => new Request("http://localhost/metricas");
  const desligada = responderMetricas(pedido(), new MetricasEdge(), "");
  assertEquals(desligada.status, 404);

  const semToken = responderMetricas(pedido(), new MetricasEdge(), "token-de-teste");
  assertEquals(semToken.status, 401);
  const errado = responderMetricas(
    new Request("http://localhost/metricas", { headers: { authorization: "Bearer outro" } }),
    new MetricasEdge(),
    "token-de-teste",
  );
  assertEquals(errado.status, 401);
  const destino = new MetricasEdge();
  destino.registrar("saude", 200, 5);
  const ok = responderMetricas(
    new Request("http://localhost/metricas", {
      headers: { authorization: "Bearer token-de-teste" },
    }),
    destino,
    "token-de-teste",
  );
  assertEquals(ok.status, 200);
  assert((await ok.text()).includes('funcao="saude"'));
  assert(tokensIguais("token-de-teste", "token-de-teste"));
  assert(!tokensIguais("token-de-teste", "token-de-testE"));
  assert(!tokensIguais("", ""));
});
