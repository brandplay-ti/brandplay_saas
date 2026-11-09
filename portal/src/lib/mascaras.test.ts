import { describe, expect, it } from "vitest";
import {
  campoParaDecimal,
  dataParaIso,
  dateParaData,
  isoParaData,
  mascararData,
  moedaCabeNoLimite,
  moedaParaCampo,
  posicaoAposDigitos,
} from "./mascaras";

describe("moedaParaCampo", () => {
  it("formata número e decimal com ponto no padrão brasileiro", () => {
    expect(moedaParaCampo(1234.5)).toBe("R$ 1.234,50");
    expect(moedaParaCampo("50000")).toBe("R$ 50.000,00");
    expect(moedaParaCampo("1234567.89")).toBe("R$ 1.234.567,89");
    expect(moedaParaCampo(0)).toBe("R$ 0,00");
  });

  it("aceita o decimal brasileiro usado no plano", () => {
    expect(moedaParaCampo("490,00")).toBe("R$ 490,00");
    expect(moedaParaCampo("1.234,56")).toBe("R$ 1.234,56");
  });

  it("respeita as casas decimais pedidas", () => {
    expect(moedaParaCampo("0.075", 4)).toBe("R$ 0,0750");
  });

  it("deixa o campo vazio para vazio, nulo, negativo ou lixo", () => {
    expect(moedaParaCampo("")).toBe("");
    expect(moedaParaCampo(null)).toBe("");
    expect(moedaParaCampo(undefined)).toBe("");
    expect(moedaParaCampo(-5)).toBe("");
    expect(moedaParaCampo("abc")).toBe("");
  });
});

describe("campoParaDecimal", () => {
  it("preenche da direita para a esquerda", () => {
    expect(campoParaDecimal("1")).toBe("0.01");
    expect(campoParaDecimal("12")).toBe("0.12");
    expect(campoParaDecimal("123")).toBe("1.23");
    expect(campoParaDecimal("123456")).toBe("1234.56");
  });

  it("lê o texto já mascarado com o dígito novo", () => {
    expect(campoParaDecimal("R$ 1.234,567")).toBe("12345.67");
    expect(campoParaDecimal("R$ 0,005")).toBe("0.05");
  });

  it("não perde precisão no limite das colunas de dinheiro", () => {
    expect(campoParaDecimal("99999999999999")).toBe("999999999999.99");
  });

  it("sem dígitos, volta vazio", () => {
    expect(campoParaDecimal("")).toBe("");
    expect(campoParaDecimal("R$ ")).toBe("");
  });

  it("respeita as casas decimais pedidas", () => {
    expect(campoParaDecimal("750", 4)).toBe("0.0750");
  });
});

describe("moedaCabeNoLimite", () => {
  it("aceita até 12 dígitos inteiros", () => {
    expect(moedaCabeNoLimite("999999999999.99")).toBe(true);
    expect(moedaCabeNoLimite("1000000000000.00")).toBe(false);
  });
});

describe("mascararData", () => {
  it("coloca as barras conforme a digitação", () => {
    expect(mascararData("1")).toBe("1");
    expect(mascararData("12")).toBe("12");
    expect(mascararData("123")).toBe("12/3");
    expect(mascararData("1203")).toBe("12/03");
    expect(mascararData("12032")).toBe("12/03/2");
    expect(mascararData("12032026")).toBe("12/03/2026");
  });

  it("não prende o backspace na barra", () => {
    expect(mascararData("12/")).toBe("12");
    expect(mascararData("12/03/")).toBe("12/03");
  });

  it("completa o zero de quem digita 1/3/2026", () => {
    expect(mascararData("1/")).toBe("01");
    expect(mascararData("01/3/")).toBe("01/03");
    expect(mascararData("12/3/")).toBe("12/03");
  });

  it("não inventa zero quando se corrige o dia no meio do texto", () => {
    expect(mascararData("2/03/2026")).toBe("20/32/026");
  });

  it("corta o que passa do limite", () => {
    expect(mascararData("120320261430")).toBe("12/03/2026");
  });

  it("mascara a hora quando pedido", () => {
    expect(mascararData("120320261", true)).toBe("12/03/2026 1");
    expect(mascararData("120320261430", true)).toBe("12/03/2026 14:30");
  });

  it("aceita colar ISO", () => {
    expect(mascararData("2026-03-12")).toBe("12/03/2026");
    expect(mascararData("2026-03-12T14:30", true)).toBe("12/03/2026 14:30");
  });
});

describe("dataParaIso", () => {
  it("converte data completa", () => {
    expect(dataParaIso("12/03/2026")).toBe("2026-03-12");
    expect(dataParaIso("29/02/2024")).toBe("2024-02-29");
    expect(dataParaIso("12/03/2026 14:30", true)).toBe("2026-03-12T14:30");
  });

  it("recusa incompleta", () => {
    expect(dataParaIso("")).toBe("");
    expect(dataParaIso("12/03/202")).toBe("");
    expect(dataParaIso("12/03/2026 14", true)).toBe("");
  });

  it("recusa data que não existe", () => {
    expect(dataParaIso("31/02/2026")).toBe("");
    expect(dataParaIso("29/02/2026")).toBe("");
    expect(dataParaIso("12/13/2026")).toBe("");
    expect(dataParaIso("00/03/2026")).toBe("");
  });

  it("recusa ano de digitação errada e hora que não existe", () => {
    expect(dataParaIso("12/03/0026")).toBe("");
    expect(dataParaIso("12/03/2026 24:00", true)).toBe("");
    expect(dataParaIso("12/03/2026 14:60", true)).toBe("");
  });
});

describe("isoParaData", () => {
  it("converte sem deslocar o dia", () => {
    expect(isoParaData("2026-03-01")).toBe("01/03/2026");
  });

  it("ignora a hora quando não é pedida e usa quando é", () => {
    expect(isoParaData("2026-03-12T14:30:00")).toBe("12/03/2026");
    expect(isoParaData("2026-03-12T14:30", true)).toBe("12/03/2026 14:30");
    expect(isoParaData("2026-03-12", true)).toBe("12/03/2026 00:00");
  });

  it("devolve vazio para nulo ou formato estranho", () => {
    expect(isoParaData(null)).toBe("");
    expect(isoParaData("")).toBe("");
    expect(isoParaData("ontem")).toBe("");
  });

  it("faz o caminho de volta de dataParaIso", () => {
    expect(dataParaIso(isoParaData("2026-12-31"))).toBe("2026-12-31");
  });
});

describe("dateParaData", () => {
  it("completa os zeros", () => {
    expect(dateParaData(new Date(2026, 0, 5))).toBe("05/01/2026");
  });
});

describe("posicaoAposDigitos", () => {
  it("pula os separadores", () => {
    expect(posicaoAposDigitos("12/03/2026", 0)).toBe(0);
    expect(posicaoAposDigitos("12/03/2026", 2)).toBe(2);
    expect(posicaoAposDigitos("12/03/2026", 3)).toBe(4);
    expect(posicaoAposDigitos("12/03/2026", 20)).toBe(10);
  });
});
