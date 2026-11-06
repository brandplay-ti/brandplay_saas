import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFiltroSalvo } from "@/hooks/useFiltroSalvo";

let orgAtiva: string | null = "org-1";
vi.mock("@/hooks/useOrganization", () => ({ useOrganization: () => ({ orgId: orgAtiva }) }));

// O `localStorage` do Node mais novo encobre o do jsdom (como em OrganizationSetup.test).
const armazenado = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => armazenado.get(k) ?? null,
  setItem: (k: string, v: string) => void armazenado.set(k, v),
  removeItem: (k: string) => void armazenado.delete(k),
  clear: () => armazenado.clear(),
});

const salvo = (org: string, tela = "propostas") =>
  JSON.parse(localStorage.getItem(`brandplay:filtros:${org}:${tela}`) ?? "{}");

describe("useFiltroSalvo", () => {
  beforeEach(() => {
    localStorage.clear();
    orgAtiva = "org-1";
  });

  it("começa no padrão e grava o filtro aplicado", () => {
    const { result } = renderHook(() => useFiltroSalvo("propostas", "statusFilter", "all"));
    expect(result.current[0]).toBe("all");
    act(() => result.current[1]("enviada"));
    expect(result.current[0]).toBe("enviada");
    expect(salvo("org-1")).toEqual({ statusFilter: "enviada" });
  });

  it("ao montar de novo (F5), resgata o filtro salvo", () => {
    const primeiro = renderHook(() => useFiltroSalvo("propostas", "search", ""));
    act(() => primeiro.result.current[1]("nike"));
    primeiro.unmount();

    const { result } = renderHook(() => useFiltroSalvo("propostas", "search", ""));
    expect(result.current[0]).toBe("nike");
  });

  it("aceita atualização por função, como o useState", () => {
    const { result } = renderHook(() => useFiltroSalvo("propostas", "showFilters", false));
    act(() => result.current[1]((v) => !v));
    expect(result.current[0]).toBe(true);
    expect(salvo("org-1")).toEqual({ showFilters: true });
  });

  it("filtros são por organização: trocar de organização carrega os dela", () => {
    localStorage.setItem("brandplay:filtros:org-2:propostas", JSON.stringify({ sponsorFilter: "sp-org-2" }));
    const { result, rerender } = renderHook(() => useFiltroSalvo("propostas", "sponsorFilter", "all"));
    act(() => result.current[1]("sp-org-1"));

    orgAtiva = "org-2";
    rerender();
    expect(result.current[0]).toBe("sp-org-2");

    orgAtiva = "org-1";
    rerender();
    expect(result.current[0]).toBe("sp-org-1");
    expect(salvo("org-1")).toEqual({ sponsorFilter: "sp-org-1" });
    expect(salvo("org-2")).toEqual({ sponsorFilter: "sp-org-2" });
  });

  it("sem organização ativa, vale o padrão e nada é gravado", () => {
    orgAtiva = null;
    localStorage.setItem("brandplay:filtros:org-1:propostas", JSON.stringify({ search: "nike" }));
    const { result, rerender } = renderHook(() => useFiltroSalvo("propostas", "search", ""));
    expect(result.current[0]).toBe("");
    act(() => result.current[1]("adidas"));
    expect(armazenado.size).toBe(1);

    // A organização carrega: o salvo dela vale.
    orgAtiva = "org-1";
    rerender();
    expect(result.current[0]).toBe("nike");
  });

  it("escopo explícito não depende da organização (área /admin)", () => {
    orgAtiva = null;
    const { result } = renderHook(() =>
      useFiltroSalvo("admin-clientes", "source", "todas", { escopo: "plataforma" }),
    );
    act(() => result.current[1]("trial"));
    expect(salvo("plataforma", "admin-clientes")).toEqual({ source: "trial" });
  });

  it("descarta opção salva que não é mais permitida", () => {
    localStorage.setItem("brandplay:filtros:org-1:propostas", JSON.stringify({ sortBy: "antiga" }));
    const { result } = renderHook(() =>
      useFiltroSalvo<"recent" | "oldest">("propostas", "sortBy", "recent", { permitidos: ["recent", "oldest"] }),
    );
    expect(result.current[0]).toBe("recent");
  });
});
