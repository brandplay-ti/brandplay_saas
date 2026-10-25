import { describe, expect, it } from "vitest";
import {
  caminhoDoLogo,
  canaisHsl,
  corSegura,
  MARCA_PADRAO,
  montarMarca,
  PRIMARIA_PADRAO,
  textoSobrePrimaria,
  type Marca,
} from "./marca";

const marca = (parcial: Partial<Marca> = {}): Marca => ({ ...MARCA_PADRAO, ...parcial });

describe("marca da organização", () => {
  it("recusa cor que não é hex de 6 dígitos", () => {
    expect(corSegura("#6206C8", PRIMARIA_PADRAO)).toBe("#6206C8");
    expect(corSegura("#fff", PRIMARIA_PADRAO)).toBe(PRIMARIA_PADRAO);
    expect(corSegura("red; } body{background:url(x)", PRIMARIA_PADRAO)).toBe(PRIMARIA_PADRAO);
    expect(corSegura(null, PRIMARIA_PADRAO)).toBe(PRIMARIA_PADRAO);
  });

  it("escolhe a peça da superfície e cai no logo único", () => {
    const comPecas = marca({
      logos: { icone: "org/icone.png", clara: "org/clara.png" },
      logoUnico: "org/logo.png",
    });
    expect(caminhoDoLogo(comPecas, "icone")).toBe("org/icone.png");
    expect(caminhoDoLogo(comPecas, "fundo_escuro")).toBe("org/clara.png");
    expect(caminhoDoLogo(comPecas, "cabecalho")).toBe("org/logo.png");
    expect(caminhoDoLogo(marca(), "cabecalho")).toBeNull();
  });

  it("prefere horizontal no cabeçalho antes da versão escura", () => {
    const completa = marca({
      logos: { horizontal: "h.png", escura: "e.png", sem_fundo: "s.png" },
    });
    expect(caminhoDoLogo(completa, "cabecalho")).toBe("h.png");
    expect(caminhoDoLogo(completa, "fundo_claro")).toBe("e.png");
  });

  it("ignora tipo de arquivo desconhecido e hex inválido vindo do banco", () => {
    const resultado = montarMarca(
      { primary_hex: "roxo", secondary_hex: "#2962FF" },
      [{ kind: "banner", storage_path: "x.png" }, { kind: "horizontal", storage_path: "h.png" }],
      "unico.png",
    );
    expect(resultado.primaria).toBe(PRIMARIA_PADRAO);
    expect(resultado.secundaria).toBe("#2962FF");
    expect(resultado.logos).toEqual({ horizontal: "h.png" });
    expect(resultado.logoUnico).toBe("unico.png");
  });

  it("mantém texto branco sobre o roxo da BrandPlay e grafite sobre amarelo", () => {
    expect(textoSobrePrimaria("#6206C8")).toBe("0 0% 100%");
    expect(textoSobrePrimaria("#FFE566")).toBe("230 38% 9%");
    expect(canaisHsl("#6206C8")).toMatch(/^\d+(\.\d+)? \d+(\.\d+)?% \d+(\.\d+)?%$/);
  });
});
