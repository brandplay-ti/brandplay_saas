import { describe, expect, it } from "vitest";
import {
  buscaDeUsuario,
  ehFalhaDeRls,
  filtroDeCliente,
  nomeDoCliente,
  nomesDasPolicies,
  SEM_CLIENTE,
  TODOS_OS_CLIENTES,
} from "@/lib/logsDeFalha";

const ORG = "a2000000-0000-4000-8000-000000000001";

describe("filtroDeCliente", () => {
  it("separa todos, sem organização e uma organização", () => {
    expect(filtroDeCliente(TODOS_OS_CLIENTES)).toEqual({ tipo: "todos" });
    expect(filtroDeCliente(SEM_CLIENTE)).toEqual({ tipo: "sem-organizacao" });
    expect(filtroDeCliente(ORG)).toEqual({ tipo: "organizacao", id: ORG });
  });

  it("valor salvo inválido vale todos", () => {
    expect(filtroDeCliente("org-que-sumiu")).toEqual({ tipo: "todos" });
  });
});

describe("buscaDeUsuario", () => {
  it("uuid busca pelo id exato", () => {
    expect(buscaDeUsuario(` ${ORG} `)).toEqual({ coluna: "user_id", valor: ORG });
  });

  it("texto busca parte do e-mail, com curingas digitados escapados", () => {
    expect(buscaDeUsuario("maria")).toEqual({ coluna: "user_email", valor: "%maria%" });
    expect(buscaDeUsuario("a_b%c")).toEqual({ coluna: "user_email", valor: "%a\\_b\\%c%" });
  });

  it("vazio não filtra", () => {
    expect(buscaDeUsuario("   ")).toBeNull();
  });
});

describe("nomeDoCliente", () => {
  const nomes = new Map([[ORG, "Clube A"]]);

  it("usa o nome da organização", () => {
    expect(nomeDoCliente(ORG, nomes)).toBe("Clube A");
  });

  it("explica quando não há organização ou ela não existe mais", () => {
    expect(nomeDoCliente(null, nomes)).toBe("Sem organização");
    expect(nomeDoCliente("b2000000-0000-4000-8000-000000000002", nomes)).toBe("Organização removida");
  });
});

describe("ehFalhaDeRls", () => {
  it("reconhece a mensagem do Postgres", () => {
    expect(ehFalhaDeRls('new row violates row-level security policy for table "sponsors"')).toBe(true);
    expect(ehFalhaDeRls("duplicate key value")).toBe(false);
    expect(ehFalhaDeRls(null)).toBe(false);
  });
});

describe("nomesDasPolicies", () => {
  it("lê o jsonb gravado e ignora lixo", () => {
    expect(nomesDasPolicies([{ policyname: "sponsors_tenant" }, { cmd: "ALL" }, {}, null, "x"])).toEqual([
      "sponsors_tenant",
      "ALL",
      "policy",
    ]);
    expect(nomesDasPolicies({})).toEqual([]);
  });
});
