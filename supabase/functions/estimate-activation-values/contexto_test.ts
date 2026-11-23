// Testes das regras de `contexto.ts`. Não acessam rede nem banco. Rodam no job
// `funcoes` do CI; localmente:
//
//   docker run --rm -e DENO_NO_PACKAGE_JSON=1 -v "<repo>/supabase/functions:/fn:ro" -w /fn \
//     denoland/deno:2.1.4 deno test estimate-activation-values/

import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type ContextoDaEstimativa,
  lerAtivacoesDoCorpo,
  lerItens,
  lerProposta,
  MAX_ATIVACOES,
  montarPedido,
  normalizarSugestoes,
  SEM_BASE,
  SEM_REFERENCIA,
  semBase,
  temBase,
} from "./contexto.ts";

const contextoVazio = (): ContextoDaEstimativa => ({
  ativacoes: [{ title: "Blitz", description: "Na entrada do estádio" }],
  itensDaProposta: [],
  projetoAtual: null,
  projetos: [],
  propostas: [],
  ativos: [],
});

Deno.test("ativações do corpo: de 1 ao máximo, com título ou descrição", () => {
  assertEquals(lerAtivacoesDoCorpo(undefined), null);
  assertEquals(lerAtivacoesDoCorpo([]), null);
  assertEquals(lerAtivacoesDoCorpo(Array.from({ length: MAX_ATIVACOES + 1 }, () => ({ title: "x" }))), null);
  assertEquals(lerAtivacoesDoCorpo([{ title: " ", description: "" }]), null);
  assertEquals(lerAtivacoesDoCorpo([{ title: " Blitz ", description: 5 }]), [{ title: "Blitz", description: "" }]);
  assertEquals(lerAtivacoesDoCorpo([{ title: "x".repeat(400), description: "d" }])?.[0].title.length, 300);
});

Deno.test("itens: descarta sem nome e corrige quantidade e valor", () => {
  assertEquals(lerItens([{ name: "Placa", quantity: 0, unit_value: -5 }, { name: "" }, null, "x"]), [
    { name: "Placa", description: null, quantity: 1, unit_value: 0 },
  ]);
  assertEquals(lerItens("x"), []);
});

Deno.test("sem propostas e sem ativos com valor, não há base", () => {
  const contexto = contextoVazio();
  assertEquals(temBase(contexto), false);
  contexto.ativos = [{ name: "Placa", category: null, unit_value: 0 }];
  assertEquals(temBase(contexto), false);
  contexto.ativos = [{ name: "Placa", category: null, unit_value: 100 }];
  assertEquals(temBase(contexto), true);
  assertEquals(semBase(2), [
    { index: 0, suggested_value: null, rationale: SEM_BASE, overlaps_with: null },
    { index: 1, suggested_value: null, rationale: SEM_BASE, overlaps_with: null },
  ]);
});

Deno.test("proposta em valor geral entra sem valor unitário dos itens", () => {
  const proposta = lerProposta(
    {
      title: "Copa Verão",
      status: "aceita",
      total_value: "50000",
      use_flat_value: true,
      property_id: "p1",
      proposal_items: [{ name: "Placa LED", quantity: 2, unit_value: 9999 }],
    },
    (id) => (id === "p1" ? "Estadual" : null),
  );
  assertEquals(proposta.projeto, "Estadual");
  const pedido = montarPedido({ ...contextoVazio(), propostas: [proposta] });
  assertStringIncludes(pedido, "valor geral fechado");
  assertStringIncludes(pedido, "2x Placa LED");
  assert(!pedido.includes("9.999"), "valor unitário de proposta em valor geral não vai para o prompt");
});

Deno.test("prompt leva ativações com índice, itens atuais e a base", () => {
  const pedido = montarPedido({
    ...contextoVazio(),
    ativacoes: [{ title: "Blitz", description: "" }, { title: "Sampling", description: "Degustação" }],
    itensDaProposta: [{ name: "Placa LED", description: null, quantity: 1, unit_value: 1500 }],
    projetoAtual: { name: "Estadual", category: "Futebol", audience_estimate: 20000 },
    ativos: [{ name: "Backdrop", category: "Mídia", unit_value: 3000 }],
  });
  assertStringIncludes(pedido, "[0] Blitz");
  assertStringIncludes(pedido, "[1] Sampling — Degustação");
  assertStringIncludes(pedido, "1x Placa LED (R$ 1.500,00 cada)");
  assertStringIncludes(pedido, "Estadual (Futebol), público estimado 20.000");
  assertStringIncludes(pedido, "Backdrop (Mídia): R$ 3.000,00");
});

Deno.test("normaliza: uma sugestão por ativação, na ordem, sem índice repetido ou fora da lista", () => {
  const sugestoes = normalizarSugestoes({
    suggestions: [
      { index: 1, has_reference: true, suggested_value: 1234.567, rationale: "Parecida com a Copa Verão", overlaps_with: "" },
      { index: 1, has_reference: true, suggested_value: 1, rationale: "repetida", overlaps_with: "" },
      { index: 7, has_reference: true, suggested_value: 1, rationale: "fora", overlaps_with: "" },
      { index: 0.5, has_reference: true, suggested_value: 1, rationale: "quebrado", overlaps_with: "" },
    ],
  }, 3, []);
  assertEquals(sugestoes.map((s) => s.index), [0, 1, 2]);
  assertEquals(sugestoes[1], { index: 1, suggested_value: 1234.57, rationale: "Parecida com a Copa Verão", overlaps_with: null });
  assertEquals(sugestoes[0], { index: 0, suggested_value: null, rationale: SEM_REFERENCIA, overlaps_with: null });
  assertEquals(sugestoes[2].suggested_value, null);
});

Deno.test("normaliza: sem referência, zero ou negativo voltam sem valor", () => {
  const sugestoes = normalizarSugestoes({
    suggestions: [
      { index: 0, has_reference: false, suggested_value: 5000, rationale: "", overlaps_with: "" },
      { index: 1, has_reference: true, suggested_value: 0, rationale: "", overlaps_with: "" },
      { index: 2, has_reference: true, suggested_value: -10, rationale: "x", overlaps_with: "" },
      { index: 3, has_reference: true, suggested_value: 1e12, rationale: "x", overlaps_with: "" },
    ],
  }, 4, []);
  assertEquals(sugestoes.map((s) => s.suggested_value), [null, null, null, null]);
  assertEquals(sugestoes[0].rationale, SEM_REFERENCIA);
});

Deno.test("normaliza: sobreposição só com item que existe, no nome original", () => {
  const sugestoes = normalizarSugestoes({
    suggestions: [
      { index: 0, has_reference: true, suggested_value: 10, rationale: "r", overlaps_with: " placa led " },
      { index: 1, has_reference: true, suggested_value: 10, rationale: "r", overlaps_with: "Item inventado" },
    ],
  }, 2, ["Placa LED"]);
  assertEquals(sugestoes[0].overlaps_with, "Placa LED");
  assertEquals(sugestoes[1].overlaps_with, null);
});

Deno.test("normaliza: resposta sem a lista não quebra", () => {
  assertEquals(normalizarSugestoes(null, 1, []), [{ index: 0, suggested_value: null, rationale: SEM_REFERENCIA, overlaps_with: null }]);
  assertEquals(normalizarSugestoes({ suggestions: "x" }, 0, []), []);
});
