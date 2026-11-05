import { describe, expect, it } from "vitest";
import {
  MODULOS_DE_PERMISSAO,
  moduloDisponivel,
  modulosDoTipo,
  podeVerModulo,
  podeVerModuloPadrao,
} from "./permissoes";
import type { NavModule } from "./navegacao";

const MODULOS: NavModule[] = ["crm", "vendas", "operacional", "financeiro", "team"];

describe("permissoes", () => {
  it("cobre os cinco módulos que o menu e o banco usam (0043)", () => {
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

  it("sem a matriz, vendas segue o crm: comercial vê, operacional não", () => {
    expect(podeVerModuloPadrao("comercial", "vendas")).toBe(true);
    expect(podeVerModuloPadrao("operacional", "vendas")).toBe(false);
    expect(podeVerModuloPadrao("admin", "vendas")).toBe(true);
  });
});

describe("teto por tipo de cliente", () => {
  it("a marca não tem o módulo vendas; o resto continua", () => {
    expect(moduloDisponivel("marca", "vendas")).toBe(false);
    expect(moduloDisponivel("marca", "crm")).toBe(true);
    expect(moduloDisponivel("marca", "financeiro")).toBe(true);
    expect(moduloDisponivel("agencia", "vendas")).toBe(true);
  });

  it("a matriz da marca não mostra a linha do funil", () => {
    expect(modulosDoTipo("marca").map((m) => m.key)).not.toContain("vendas");
    expect(modulosDoTipo("agencia").map((m) => m.key)).toContain("vendas");
  });
});
