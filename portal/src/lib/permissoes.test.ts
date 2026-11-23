import { describe, expect, it } from "vitest";
import {
  MODULOS_DE_PERMISSAO,
  ehRecusaDePermissao,
  mensagemDeErroDeGravacao,
  mensagemSemEdicao,
  moduloDisponivel,
  modulosDoTipo,
  podeEditarModulo,
  podeEditarModuloPadrao,
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

describe("edição do módulo (BP-2)", () => {
  it("só write edita; read vê mas não grava, como can_access_module(..., true)", () => {
    expect(podeEditarModulo("write")).toBe(true);
    expect(podeEditarModulo("read")).toBe(false);
    expect(podeEditarModulo("none")).toBe(false);
    expect(podeEditarModulo(undefined)).toBe(false);
  });

  it("sem a matriz, segue o padrão da 0043: operacional e financeiro só leem vendas", () => {
    expect(podeEditarModuloPadrao("owner", "vendas")).toBe(true);
    expect(podeEditarModuloPadrao("admin", "vendas")).toBe(true);
    expect(podeEditarModuloPadrao("comercial", "vendas")).toBe(true);
    expect(podeEditarModuloPadrao("operacional", "vendas")).toBe(false);
    expect(podeEditarModuloPadrao("financeiro", "vendas")).toBe(false);
    expect(podeEditarModuloPadrao("operacional", "operacional")).toBe(true);
  });
});

describe("erro de gravação dito para a tela (BP-2)", () => {
  const recusa = { code: "42501", message: 'new row violates row-level security policy for table "proposals"' };

  it("a recusa da RLS vira o aviso de permissão do módulo, sem a mensagem do Postgres", () => {
    expect(ehRecusaDePermissao(recusa)).toBe(true);
    const texto = mensagemDeErroDeGravacao(recusa, "vendas");
    expect(texto).toBe(mensagemSemEdicao("vendas"));
    expect(texto).toContain("Funil e captação");
    expect(texto).not.toContain("row-level security");
  });

  it("outros erros mantêm a mensagem; sem mensagem, o padrão", () => {
    expect(ehRecusaDePermissao({ code: "23505" })).toBe(false);
    expect(mensagemDeErroDeGravacao({ code: "23505", message: "duplicado" }, "vendas")).toBe("duplicado");
    expect(mensagemDeErroDeGravacao(new Error("Não autenticado"), "vendas")).toBe("Não autenticado");
    expect(mensagemDeErroDeGravacao(null, "vendas", "Falha ao salvar")).toBe("Falha ao salvar");
  });
});
