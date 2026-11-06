import { beforeEach, describe, expect, it, vi } from "vitest";
import { chaveDosFiltros, gravarFiltro, lerFiltro } from "@/lib/filtrosSalvos";

// O `localStorage` do Node mais novo encobre o do jsdom (como em OrganizationSetup.test).
const armazenado = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => armazenado.get(k) ?? null,
  setItem: (k: string, v: string) => void armazenado.set(k, v),
  removeItem: (k: string) => void armazenado.delete(k),
  clear: () => armazenado.clear(),
});

const CHAVE = "brandplay:filtros:org-1:propostas";

describe("chaveDosFiltros", () => {
  it("separa por escopo e tela", () => {
    expect(chaveDosFiltros("org-1", "propostas")).toBe(CHAVE);
    expect(chaveDosFiltros("org-2", "propostas")).not.toBe(CHAVE);
  });

  it("sem escopo não há chave", () => {
    expect(chaveDosFiltros(null, "propostas")).toBeNull();
    expect(chaveDosFiltros("", "propostas")).toBeNull();
  });
});

describe("lerFiltro e gravarFiltro", () => {
  beforeEach(() => localStorage.clear());

  it("sem nada salvo, devolve o padrão", () => {
    expect(lerFiltro(CHAVE, "statusFilter", "all")).toBe("all");
  });

  it("devolve o que foi gravado, campo a campo na mesma chave", () => {
    gravarFiltro(CHAVE, "statusFilter", "enviada", "all");
    gravarFiltro(CHAVE, "showFilters", true, false);
    gravarFiltro(CHAVE, "tags", ["a", "b"], [] as string[]);
    expect(lerFiltro(CHAVE, "statusFilter", "all")).toBe("enviada");
    expect(lerFiltro(CHAVE, "showFilters", false)).toBe(true);
    expect(lerFiltro(CHAVE, "tags", [] as string[])).toEqual(["a", "b"]);
    expect(JSON.parse(localStorage.getItem(CHAVE) ?? "{}")).toEqual({
      statusFilter: "enviada",
      showFilters: true,
      tags: ["a", "b"],
    });
  });

  it("valor igual ao padrão sai do armazenamento", () => {
    gravarFiltro(CHAVE, "statusFilter", "enviada", "all");
    gravarFiltro(CHAVE, "search", "nike", "");
    gravarFiltro(CHAVE, "statusFilter", "all", "all");
    expect(JSON.parse(localStorage.getItem(CHAVE) ?? "{}")).toEqual({ search: "nike" });
    gravarFiltro(CHAVE, "search", "", "");
    expect(localStorage.getItem(CHAVE)).toBeNull();
  });

  it("JSON quebrado ou que não é objeto vale como nada salvo", () => {
    localStorage.setItem(CHAVE, "{quebrado");
    expect(lerFiltro(CHAVE, "statusFilter", "all")).toBe("all");
    localStorage.setItem(CHAVE, JSON.stringify(["enviada"]));
    expect(lerFiltro(CHAVE, "statusFilter", "all")).toBe("all");
    gravarFiltro(CHAVE, "statusFilter", "enviada", "all");
    expect(lerFiltro(CHAVE, "statusFilter", "all")).toBe("enviada");
  });

  it("tipo diferente do padrão é ignorado", () => {
    localStorage.setItem(CHAVE, JSON.stringify({ showFilters: "sim", statusFilter: 3, tags: [1, 2], pagina: "2" }));
    expect(lerFiltro(CHAVE, "showFilters", false)).toBe(false);
    expect(lerFiltro(CHAVE, "statusFilter", "all")).toBe("all");
    expect(lerFiltro(CHAVE, "tags", [] as string[])).toEqual([]);
    expect(lerFiltro(CHAVE, "pagina", 1)).toBe(1);
  });

  it("opção que não está entre as permitidas é ignorada", () => {
    gravarFiltro(CHAVE, "sortBy", "removida", "recent");
    expect(lerFiltro(CHAVE, "sortBy", "recent", ["recent", "oldest"])).toBe("recent");
    gravarFiltro(CHAVE, "sortBy", "oldest", "recent");
    expect(lerFiltro(CHAVE, "sortBy", "recent", ["recent", "oldest"])).toBe("oldest");
  });

  it("armazenamento cheio não derruba a tela", () => {
    const setItem = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => gravarFiltro(CHAVE, "search", "nike", "")).not.toThrow();
    setItem.mockRestore();
  });
});
