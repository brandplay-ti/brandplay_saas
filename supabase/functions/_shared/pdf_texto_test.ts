import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { type MedidorDeTexto, quebrarTexto } from "./pdf_texto.ts";

// Fonte de largura fixa: cada caractere ocupa `tamanho` pontos.
const mono: MedidorDeTexto = {
  widthOfTextAtSize: (texto, tamanho) => Array.from(texto).length * tamanho,
};

Deno.test("texto que cabe fica numa linha só", () => {
  assertEquals(quebrarTexto("COPO PERSONALIZADO", mono, 1, 40), ["COPO PERSONALIZADO"]);
});

Deno.test("texto longo quebra entre palavras, sem cortar nem reticências", () => {
  const nome = "PRESENÇA DA MARCA NO UNIFORME PARA SEMI E FINAL";
  const linhas = quebrarTexto(nome, mono, 1, 20);
  assertEquals(linhas, ["PRESENÇA DA MARCA NO", "UNIFORME PARA SEMI E", "FINAL"]);
  assertEquals(linhas.join(" "), nome);
  for (const l of linhas) assertEquals(l.length <= 20, true);
});

Deno.test("respeita a largura medida, não o número de caracteres", () => {
  const largas: MedidorDeTexto = {
    widthOfTextAtSize: (t, s) => Array.from(t).reduce((w, c) => w + (c === "M" ? 2 : 1), 0) * s,
  };
  assertEquals(quebrarTexto("MMM iii", largas, 1, 6), ["MMM", "iii"]);
  assertEquals(quebrarTexto("iii iii", largas, 1, 7), ["iii iii"]);
});

Deno.test("palavra maior que a linha é quebrada por caractere", () => {
  assertEquals(quebrarTexto("https://exemplo.com/abc", mono, 1, 10), ["https://ex", "emplo.com/", "abc"]);
});

Deno.test("mantém as quebras de linha do próprio texto", () => {
  assertEquals(quebrarTexto("linha um\n\nlinha dois\r\n", mono, 1, 40), ["linha um", "", "linha dois"]);
});

Deno.test("texto vazio ou nulo não gera linha", () => {
  assertEquals(quebrarTexto("", mono, 1, 10), []);
  assertEquals(quebrarTexto("   ", mono, 1, 10), []);
  assertEquals(quebrarTexto(null, mono, 1, 10), []);
});

Deno.test("o tamanho da fonte entra na medida", () => {
  assertEquals(quebrarTexto("ab cd", mono, 2, 8), ["ab", "cd"]);
  assertEquals(quebrarTexto("ab cd", mono, 1, 8), ["ab cd"]);
});
