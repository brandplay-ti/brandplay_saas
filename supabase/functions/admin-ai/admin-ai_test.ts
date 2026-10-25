// Testes da Edge Function admin-ai (IA-23): validação e teste de conexão simulado.

import { assertEquals, assertRejects, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  exigeComentario,
  parseChaveApi,
  parseConfiguracaoCliente,
  parseFornecedor,
  parseModelos,
  parsePrecoModelo,
  testarConexao,
} from "./index.ts";

Deno.test("exigeComentario — testar não exige comentário", () => {
  assertEquals(exigeComentario("testar", ""), "");
});

Deno.test("exigeComentario — ações de gravação exigem comentário", () => {
  assertThrows(() => exigeComentario("definir_padrao", "ab"), Error);
  assertEquals(exigeComentario("definir_padrao", "  cadastro inicial  "), "cadastro inicial");
});

Deno.test("parseFornecedor rejeita valor desconhecido", () => {
  assertThrows(() => parseFornecedor("deepseek"), Error);
  assertEquals(parseFornecedor("gemini"), "gemini");
});

Deno.test("parseChaveApi rejeita chave curta", () => {
  assertThrows(() => parseChaveApi("curta"), Error);
});

Deno.test("parseModelos usa padrões do fornecedor quando omitidos", () => {
  const m = parseModelos({ provider: "gemini" }, "gemini");
  assertEquals(m.rapido, "gemini-3.5-flash-lite");
  assertEquals(m.padrao, "gemini-3.6-flash");
});

Deno.test("testarConexao com fetch simulado — gemini ok", async () => {
  const fetchFalso: typeof fetch = () =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
  await testarConexao(
    "gemini",
    "sk-teste-0123456789abcdef",
    { rapido: "gemini-3.5-flash-lite", padrao: "x", visao: null },
    fetchFalso,
  );
});

Deno.test("parsePrecoModelo valida campos obrigatórios", () => {
  const p = parsePrecoModelo({
    provider: "gemini",
    model: "gemini-3.6-flash",
    input_brl_per_mtok: 1.5,
    output_brl_per_mtok: 6,
    valid_from: "2026-10-01",
  });
  assertEquals(p.model, "gemini-3.6-flash");
});

Deno.test("parseConfiguracaoCliente exige UUID", () => {
  assertThrows(
    () => parseConfiguracaoCliente({ organization_id: "nao-uuid", ai_enabled: true }),
    Error,
  );
});

Deno.test("testarConexao — chave inválida vira ErroDeNegocio", async () => {
  const fetchFalso: typeof fetch = () =>
    Promise.resolve(new Response("invalid", { status: 401 }));
  await assertRejects(
    () =>
      testarConexao(
        "openai",
        "sk-teste-0123456789abcdef",
        { rapido: "gpt-5.4-mini", padrao: "x", visao: null },
        fetchFalso,
      ),
    Error,
  );
});
