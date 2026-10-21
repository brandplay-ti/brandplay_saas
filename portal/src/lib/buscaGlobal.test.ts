import { describe, expect, it } from "vitest";
import { filtrarPaginas, termoDeBusca } from "./buscaGlobal";

describe("filtrarPaginas", () => {
  const paginas = [
    { title: "Relatórios", grupo: "Reports" },
    { title: "Uploads", grupo: "BrandTrack" },
    { title: "Patrocinadores", grupo: "CRM" },
  ];

  it("ignora acento e caixa", () => {
    expect(filtrarPaginas(paginas, "RELATORIO").map((p) => p.title)).toEqual(["Relatórios"]);
  });

  it("acha pelo nome do grupo", () => {
    expect(filtrarPaginas(paginas, "brandtrack").map((p) => p.title)).toEqual(["Uploads"]);
  });

  it("sem termo, devolve todas", () => {
    expect(filtrarPaginas(paginas, "  ")).toHaveLength(3);
  });
});

describe("termoDeBusca", () => {
  it("menos de 2 caracteres não busca", () => {
    expect(termoDeBusca("")).toBeNull();
    expect(termoDeBusca(" a ")).toBeNull();
  });

  it("normaliza espaços", () => {
    expect(termoDeBusca("  Copa   do  Brasil ")).toBe("Copa do Brasil");
  });

  it("tira o que quebraria o filtro do PostgREST ou viraria curinga", () => {
    expect(termoDeBusca("nike,name.eq.x")).toBe("nike name.eq.x");
    expect(termoDeBusca("a(b)")).toBe("a b");
    expect(termoDeBusca(`"nike"`)).toBe("nike");
    expect(termoDeBusca("100%_*\\")).toBe("100");
  });

  it("corta termos muito longos", () => {
    expect(termoDeBusca("x".repeat(200))).toHaveLength(60);
  });
});
