import { describe, expect, it } from "vitest";
import { TITULO_PADRAO, tituloDaPagina } from "./pageTitle";

describe("tituloDaPagina", () => {
  it("landing usa o título do index.html", () => {
    expect(tituloDaPagina("/")).toBe(TITULO_PADRAO);
  });

  it("acrescenta a marca no fim", () => {
    expect(tituloDaPagina("/dashboard/pipeline")).toBe("Pipeline · Brandplay");
    expect(tituloDaPagina("/auth")).toBe("Entrar · Brandplay");
  });

  it("aceita barra no fim", () => {
    expect(tituloDaPagina("/dashboard/contratos/")).toBe("Contratos · Brandplay");
  });

  it("distingue lista e detalhe", () => {
    expect(tituloDaPagina("/dashboard/propriedades")).toBe("Propriedades · Brandplay");
    expect(tituloDaPagina("/dashboard/propriedades/abc-123")).toBe("Propriedade · Brandplay");
    expect(tituloDaPagina("/dashboard/brandtrack/marcas")).toBe("Análise por patrocinador · BrandTrack · Brandplay");
    expect(tituloDaPagina("/dashboard/brandtrack/marcas/nike")).toBe("Patrocinador · BrandTrack · Brandplay");
    expect(tituloDaPagina("/dashboard/brandtrack/marcas-esperadas")).toBe("Marcas esperadas · BrandTrack · Brandplay");
  });

  it("deixa o media kit público definir o próprio título", () => {
    expect(tituloDaPagina("/p/clube-x")).toBeNull();
  });

  it("rota desconhecida vira página não encontrada", () => {
    expect(tituloDaPagina("/nao-existe")).toBe("Página não encontrada · Brandplay");
    expect(tituloDaPagina("/dashboard/nao-existe")).toBe("Página não encontrada · Brandplay");
  });
});
