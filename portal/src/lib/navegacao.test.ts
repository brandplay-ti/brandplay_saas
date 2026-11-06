import { describe, expect, it } from "vitest";
import { gruposVisiveis, urlAtiva, type NavModule } from "./navegacao";

const acesso = (modulos: NavModule[], extra: Partial<Parameters<typeof gruposVisiveis>[0]> = {}) => ({
  can: (m: NavModule) => modulos.includes(m),
  isAdmin: false,
  loading: false,
  isPlatformAdmin: false,
  ...extra,
});

const urls = (g: ReturnType<typeof gruposVisiveis>) => g.flatMap((x) => x.items.map((i) => i.url));

describe("gruposVisiveis", () => {
  it("financeiro não vê o CRM nem a administração", () => {
    const u = urls(gruposVisiveis(acesso(["financeiro"])));
    expect(u).toContain("/dashboard/financeiro");
    expect(u).toContain("/dashboard/contratos");
    expect(u).not.toContain("/dashboard/pipeline");
    expect(u).not.toContain("/dashboard/equipe");
  });

  it("quem tem todos os módulos vê o painel, menos a área da plataforma", () => {
    const u = urls(gruposVisiveis(acesso(["crm", "vendas", "operacional", "financeiro", "team"])));
    expect(u).toContain("/dashboard/equipe");
    expect(u).toContain("/dashboard/pipeline");
    expect(u).not.toContain("/admin");
  });

  it("crm sem vendas: patrocinadores sem pipeline, propostas e lead scoring", () => {
    const u = urls(gruposVisiveis(acesso(["crm"])));
    expect(u).toContain("/dashboard/patrocinadores");
    expect(u).not.toContain("/dashboard/pipeline");
    expect(u).not.toContain("/dashboard/propostas");
    expect(u).not.toContain("/dashboard/lead-scoring");
  });

  it("marca não vê o funil nem durante o carregamento, e chama patrocinadores de Marcas", () => {
    const grupos = gruposVisiveis(acesso(["crm", "vendas"], { clientType: "marca", loading: true }));
    const u = urls(grupos);
    expect(u).not.toContain("/dashboard/pipeline");
    expect(u).not.toContain("/dashboard/propostas");
    expect(u).toContain("/dashboard/patrocinadores");
    const item = grupos.flatMap((g) => g.items).find((i) => i.url === "/dashboard/patrocinadores");
    expect(item?.title).toBe("Marcas");
  });

  it("superadmin ganha o atalho da plataforma", () => {
    expect(urls(gruposVisiveis(acesso([], { isPlatformAdmin: true })))).toContain("/admin");
  });

  it("some com grupo que ficou vazio", () => {
    const grupos = gruposVisiveis(acesso([]));
    expect(grupos.find((g) => g.label === "CRM")).toBeUndefined();
    expect(grupos.every((g) => g.items.length > 0)).toBe(true);
  });
});

describe("urlAtiva", () => {
  const grupos = gruposVisiveis(acesso(["crm", "operacional", "financeiro", "team"]));

  it("escolhe o item mais específico", () => {
    expect(urlAtiva(grupos, "/dashboard/brandtrack/uploads")).toBe("/dashboard/brandtrack/uploads");
    expect(urlAtiva(grupos, "/dashboard/brandtrack")).toBe("/dashboard/brandtrack");
    expect(urlAtiva(grupos, "/dashboard/propriedades/abc")).toBe("/dashboard/propriedades");
  });

  it("não confunde prefixo de nome com subpágina", () => {
    expect(urlAtiva(grupos, "/dashboard/brandtrack/marcas-esperadas")).toBe("/dashboard/brandtrack/marcas-esperadas");
    expect(urlAtiva(grupos, "/dashboard/brandtrack/marcas/nike")).toBe("/dashboard/brandtrack/marcas");
  });
});
