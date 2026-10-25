import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { caminhoDoLogo, componentesRgb, corSegura, montarMarca, PRIMARIA_PADRAO } from "./marca.ts";

Deno.test("cor fora do hex não entra no PDF", () => {
  assertEquals(corSegura("#6206C8", PRIMARIA_PADRAO), "#6206C8");
  assertEquals(corSegura("#fff", PRIMARIA_PADRAO), PRIMARIA_PADRAO);
  assertEquals(corSegura("red;background:url(x)", PRIMARIA_PADRAO), PRIMARIA_PADRAO);
  const [r, g, b] = componentesRgb("#6206C8");
  assertEquals(Math.round(r * 255), 0x62);
  assertEquals(Math.round(g * 255), 0x06);
  assertEquals(Math.round(b * 255), 0xc8);
});

Deno.test("cabeçalho prefere horizontal e cai no logo único", () => {
  const marca = montarMarca(
    { primary_hex: "#112233", secondary_hex: "azul" },
    [{ kind: "clara", storage_path: "c.png" }, { kind: "banner", storage_path: "b.png" }],
    "unico.png",
  );
  assertEquals(marca.primaria, "#112233");
  assertEquals(marca.secundaria, "#2962FF");
  assertEquals(caminhoDoLogo(marca, "fundo_escuro"), "c.png");
  assertEquals(caminhoDoLogo(marca, "cabecalho"), "unico.png");
  assertEquals(caminhoDoLogo(marca, "icone"), "unico.png");
});
