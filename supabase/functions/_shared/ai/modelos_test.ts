// Testes da tabela de modelos e da matriz de capacidades (backlog IA-08).
//
//   deno test --allow-read supabase/functions/_shared/ai/

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  aceitaFerramentaObrigatoria,
  FOLGA_DE_RACIOCINIO,
  limiteDeSaida,
  MODELOS_PADRAO,
  modeloDoNivel,
  TETO_DE_SAIDA,
} from "./modelos.ts";
import { FORNECEDORES, LIMITE_MAX_TOKENS, NIVEIS } from "./tipos.ts";

Deno.test("todo fornecedor tem modelo padrão para todo nível, inclusive visão", () => {
  for (const fornecedor of FORNECEDORES) {
    for (const nivel of NIVEIS) {
      const modelo = modeloDoNivel(MODELOS_PADRAO[fornecedor], nivel);
      assert(modelo && modelo.trim() === modelo && modelo.length > 0, `${fornecedor}/${nivel}`);
    }
  }
  assertEquals(modeloDoNivel({ rapido: "a", padrao: "b", visao: null }, "visao"), null);
});

Deno.test("ferramenta obrigatória: OpenAI e Gemini aceitam; na Anthropic só os modelos que sabidamente aceitam", () => {
  assert(aceitaFerramentaObrigatoria("openai", "qualquer"));
  assert(aceitaFerramentaObrigatoria("gemini", "qualquer"));

  for (const aceita of ["claude-haiku-5-5", "claude-haiku-4-5", "claude-haiku-4-5-20251001", "claude-sonnet-5", "claude-opus-5", "claude-fable-5", "claude-opus-4-8", "claude-sonnet-4-6"]) {
    assert(aceitaFerramentaObrigatoria("anthropic", aceita), aceita);
  }
  // Recusam com 400 — e modelo desconhecido vai pelo caminho que serve a todos.
  for (const recusa of ["claude-sonnet-5-5", "claude-opus-5-5", "claude-fable-5-1", "claude-mythos-5-1", "claude-sonnet-6", "outro"]) {
    assert(!aceitaFerramentaObrigatoria("anthropic", recusa), recusa);
  }
});

Deno.test("limite de saída leva folga para o raciocínio, sem passar do teto", () => {
  assertEquals(limiteDeSaida(1024), 1024 + FOLGA_DE_RACIOCINIO);
  assertEquals(limiteDeSaida(LIMITE_MAX_TOKENS), TETO_DE_SAIDA);
  assert(TETO_DE_SAIDA >= LIMITE_MAX_TOKENS);
});
