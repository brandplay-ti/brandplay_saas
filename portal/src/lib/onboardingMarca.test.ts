import { beforeEach, describe, expect, it, vi } from "vitest";
import { lembrarEtapaDeMarcaPulada, precisaDaEtapaDeMarca, pulouEtapaDeMarca } from "./onboardingMarca";

// O `localStorage` do Node mais novo encobre o do jsdom (como em OrganizationSetup.test).
const armazenado = new Map<string, string>();
const emMemoria = {
  getItem: (k: string) => armazenado.get(k) ?? null,
  setItem: (k: string, v: string) => void armazenado.set(k, v),
  removeItem: (k: string) => void armazenado.delete(k),
  clear: () => armazenado.clear(),
};
vi.stubGlobal("localStorage", emMemoria);

const base = { papel: "owner", temKit: false, temAcesso: true, pulou: false };

describe("precisaDaEtapaDeMarca", () => {
  it("owner e admin de organização sem kit, com acesso, passam pela etapa", () => {
    expect(precisaDaEtapaDeMarca(base)).toBe(true);
    expect(precisaDaEtapaDeMarca({ ...base, papel: "admin" })).toBe(true);
  });

  it("os demais papéis não passam: só owner/admin gravam o kit", () => {
    for (const papel of ["comercial", "operacional", "financeiro"]) {
      expect(precisaDaEtapaDeMarca({ ...base, papel })).toBe(false);
    }
  });

  it("não aparece com kit salvo, sem acesso ou depois de pular", () => {
    expect(precisaDaEtapaDeMarca({ ...base, temKit: true })).toBe(false);
    expect(precisaDaEtapaDeMarca({ ...base, temAcesso: false })).toBe(false);
    expect(precisaDaEtapaDeMarca({ ...base, pulou: true })).toBe(false);
  });
});

describe("etapa pulada", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", emMemoria);
    armazenado.clear();
  });

  it("fica guardada por organização", () => {
    expect(pulouEtapaDeMarca("org-a")).toBe(false);
    lembrarEtapaDeMarcaPulada("org-a");
    expect(pulouEtapaDeMarca("org-a")).toBe(true);
    expect(pulouEtapaDeMarca("org-b")).toBe(false);
  });

  it("sem armazenamento, não quebra e a etapa volta", () => {
    const falha = () => {
      throw new Error("bloqueado");
    };
    vi.stubGlobal("localStorage", { getItem: falha, setItem: falha, removeItem: falha, clear: falha });
    expect(() => lembrarEtapaDeMarcaPulada("org-a")).not.toThrow();
    expect(pulouEtapaDeMarca("org-a")).toBe(false);
  });
});
