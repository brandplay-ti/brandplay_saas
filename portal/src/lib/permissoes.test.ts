import { describe, expect, it } from "vitest";
import { MODULOS_DE_PERMISSAO, podeVerModulo, podeVerModuloPadrao } from "./permissoes";
import type { NavModule } from "./navegacao";

const MODULOS: NavModule[] = ["crm", "operacional", "financeiro", "team"];

describe("permissoes", () => {
  it("cobre os quatro módulos que o menu e o banco usam", () => {
    expect(MODULOS_DE_PERMISSAO.map((m) => m.key).sort()).toEqual([...MODULOS].sort());
  });

  it("leitura e edição aparecem no menu; sem acesso, não", () => {
    expect(podeVerModulo("read")).toBe(true);
    expect(podeVerModulo("write")).toBe(true);
    expect(podeVerModulo("none")).toBe(false);
    expect(podeVerModulo(undefined)).toBe(false);
  });

  it("sem a matriz, operacional não vê a equipe e vê o próprio módulo", () => {
    expect(podeVerModuloPadrao("operacional", "operacional")).toBe(true);
    expect(podeVerModuloPadrao("operacional", "team")).toBe(false);
    expect(podeVerModuloPadrao("owner", "team")).toBe(true);
  });
});
