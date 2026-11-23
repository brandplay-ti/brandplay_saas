import { describe, expect, it } from "vitest";
import {
  aplicarValores,
  ativacaoJaNosItens,
  ativacaoParaEntrega,
  ativacaoParaItem,
  ativacoesFaltando,
  definirValorManual,
  lerAtivacoes,
  riscoDeDuplicar,
  valorDaAtivacao,
} from "./propostaAtivacoes";

describe("lerAtivacoes", () => {
  it("lê ativações antigas, sem valor", () => {
    expect(lerAtivacoes({ activations: [{ title: "Blitz", description: "Na entrada" }] }))
      .toEqual([{ title: "Blitz", description: "Na entrada", value: null }]);
  });

  it("guarda valor e origem, e trata origem desconhecida como manual", () => {
    expect(lerAtivacoes({ activations: [
      { title: "A", description: "", value: 1500.555, value_source: "ia" },
      { title: "B", description: "", value: "200", value_source: "qualquer" },
    ] })).toEqual([
      { title: "A", description: "", value: 1500.56, value_source: "ia" },
      { title: "B", description: "", value: 200, value_source: "manual" },
    ]);
  });

  it("descarta lixo do jsonb", () => {
    expect(lerAtivacoes(null)).toEqual([]);
    expect(lerAtivacoes({ activations: "x" })).toEqual([]);
    expect(lerAtivacoes({ activations: [null, 3, { title: 5, value: -10 }] }))
      .toEqual([{ title: "", description: "", value: null }]);
  });
});

describe("ativacaoParaItem", () => {
  it("vira item livre com quantidade 1 e o valor da ativação", () => {
    expect(ativacaoParaItem({ title: "  Blitz  ", description: " Na entrada ", value: 800 }, "p1", 3)).toEqual({
      proposal_id: "p1",
      name: "Blitz",
      description: "Na entrada",
      quantity: 1,
      unit_value: 800,
      position: 3,
    });
  });

  it("sem título, sem descrição e sem valor", () => {
    const item = ativacaoParaItem({ title: " ", description: "" }, "p1", 0);
    expect(item.name).toBe("Ativação");
    expect(item.description).toBeNull();
    expect(item.unit_value).toBe(0);
  });

  it("corta o nome no limite do item", () => {
    expect(ativacaoParaItem({ title: "x".repeat(300), description: "" }, "p1", 0).name).toHaveLength(200);
  });

  it("entrega do assistente não leva proposal_id", () => {
    expect(ativacaoParaEntrega({ title: "Blitz", description: "", value: 10 }))
      .toEqual({ name: "Blitz", description: undefined, quantity: 1, unit_value: 10 });
  });
});

describe("ativacaoJaNosItens / ativacoesFaltando", () => {
  const itens = [{ name: "Blitz " }, { name: "Placa LED" }];

  it("compara pelo nome sem diferenciar maiúsculas", () => {
    expect(ativacaoJaNosItens({ title: "blitz", description: "" }, itens)).toBe(true);
    expect(ativacaoJaNosItens({ title: "Sampling", description: "" }, itens)).toBe(false);
  });

  it("pula as que já estão e as repetidas na própria lista", () => {
    const ativacoes = [
      { title: "Blitz", description: "" },
      { title: "Sampling", description: "" },
      { title: "sampling", description: "" },
      { title: "Meet", description: "" },
    ];
    expect(ativacoesFaltando(ativacoes, itens)).toEqual([1, 3]);
  });
});

describe("valores", () => {
  it("valor vazio leva 0 para o item", () => {
    expect(valorDaAtivacao({ title: "", description: "" })).toBe(0);
    expect(valorDaAtivacao({ title: "", description: "", value: null })).toBe(0);
  });

  it("aplica só os valores confirmados, marcando a origem da IA", () => {
    const ativacoes = [
      { title: "A", description: "" },
      { title: "B", description: "", value: 50, value_source: "manual" as const },
      { title: "C", description: "" },
    ];
    expect(aplicarValores(ativacoes, [{ index: 0, value: 1000 }, { index: 2, value: -1 }])).toEqual([
      { title: "A", description: "", value: 1000, value_source: "ia" },
      { title: "B", description: "", value: 50, value_source: "manual" },
      { title: "C", description: "" },
    ]);
  });

  it("valor digitado à mão tira o selo da IA, e apagar tira o valor", () => {
    const sugerida = { title: "A", description: "d", value: 1000, value_source: "ia" as const };
    expect(definirValorManual(sugerida, "1200.5")).toEqual({ title: "A", description: "d", value: 1200.5, value_source: "manual" });
    expect(definirValorManual(sugerida, "")).toEqual({ title: "A", description: "d" });
  });

  it("guarda o aviso de duplicidade da sugestão e o mantém ao editar o valor", () => {
    const [comAviso] = aplicarValores([{ title: "A", description: "" }], [{ index: 0, value: 10, overlaps_with: "Placa" }]);
    expect(comAviso.overlaps_with).toBe("Placa");
    expect(definirValorManual(comAviso, "20").overlaps_with).toBe("Placa");
    const [semAviso] = aplicarValores([comAviso], [{ index: 0, value: 30, overlaps_with: null }]);
    expect(semAviso).not.toHaveProperty("overlaps_with");
    expect(lerAtivacoes({ activations: [comAviso] })[0].overlaps_with).toBe("Placa");
  });
});

describe("riscoDeDuplicar", () => {
  const itens = [{ name: "Placa LED" }, { name: "Blitz" }];

  it("sem risco quando o nome é novo e a IA não apontou nada", () => {
    expect(riscoDeDuplicar({ title: "Sampling", description: "" }, itens)).toBeNull();
  });

  it("avisa quando o nome já está nos itens", () => {
    expect(riscoDeDuplicar({ title: "blitz", description: "" }, itens)).toBe("Já está nos itens da proposta.");
  });

  it("avisa sobre o item apontado pela IA só enquanto ele está na proposta", () => {
    const ativacao = { title: "Painel", description: "", overlaps_with: "placa led" };
    expect(riscoDeDuplicar(ativacao, itens)).toBe('Pode duplicar o item "Placa LED".');
    expect(riscoDeDuplicar(ativacao, [{ name: "Blitz" }])).toBeNull();
  });
});
