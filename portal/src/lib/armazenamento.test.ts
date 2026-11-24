import { describe, expect, it } from "vitest";
import { fatiaDoTotal, formatarBytes, resumirUso, type ProjetoDoUso } from "./armazenamento";

const PROJETOS: ProjetoDoUso[] = [
  { id: "copa", name: "Copa do Mundo", parent_property_id: null },
  { id: "copa26", name: "Copa 2026", parent_property_id: "copa" },
  { id: "copa30", name: "Copa 2030", parent_property_id: "copa" },
  { id: "jogo", name: "Jogo de abertura", parent_property_id: "copa26" },
  { id: "liga", name: "Liga", parent_property_id: null },
];

describe("formatarBytes", () => {
  it("usa base 1000 e vírgula decimal", () => {
    expect(formatarBytes(0)).toBe("0 B");
    expect(formatarBytes(1500)).toBe("1,5 KB");
    expect(formatarBytes(42_000_000_000)).toBe("42,0 GB");
    expect(formatarBytes(250_000_000)).toBe("250 MB");
    expect(formatarBytes(3_200_000_000_000)).toBe("3,2 TB");
  });

  it("mostra traço para valor ausente ou inválido", () => {
    expect(formatarBytes(null)).toBe("—");
    expect(formatarBytes(undefined)).toBe("—");
    expect(formatarBytes(-1)).toBe("—");
    expect(formatarBytes(Number.NaN)).toBe("—");
  });
});

describe("resumirUso", () => {
  it("agrupa pela raiz, inclusive edição de edição, do maior para o menor", () => {
    const resumo = resumirUso(
      [
        { property_id: "copa26", total_bytes: 40_000_000_000, object_count: 30 },
        { property_id: "copa30", total_bytes: 1_000_000_000, object_count: 2 },
        { property_id: "jogo", total_bytes: 5_000_000_000, object_count: 4 },
        { property_id: "liga", total_bytes: 60_000_000_000, object_count: 10 },
        { property_id: "copa", total_bytes: 500_000, object_count: 1 },
      ],
      PROJETOS,
    );
    expect(resumo.bytes).toBe(106_000_500_000);
    expect(resumo.objetos).toBe(47);
    expect(resumo.projetos.map((p) => p.id)).toEqual(["liga", "copa"]);

    const copa = resumo.projetos[1];
    expect(copa.bytes).toBe(46_000_500_000);
    expect(copa.objetos).toBe(37);
    expect(copa.edicoes.map((e) => e.id)).toEqual(["copa26", "jogo", "copa30", "copa"]);
    expect(copa.edicoes[0]).toEqual({ id: "copa26", name: "Copa 2026", bytes: 40_000_000_000, objetos: 30 });
  });

  it("ignora linha sem projeto ou com número inválido", () => {
    const resumo = resumirUso(
      [
        { property_id: null, total_bytes: 10, object_count: 1 },
        { property_id: "liga", total_bytes: -5, object_count: 1 },
        { property_id: "liga", total_bytes: 100, object_count: 2 },
      ],
      PROJETOS,
    );
    expect(resumo.bytes).toBe(100);
    expect(resumo.projetos).toHaveLength(1);
  });

  it("projeto fora da lista vira raiz dele mesmo, e ciclo não trava", () => {
    const ciclo: ProjetoDoUso[] = [
      { id: "a", name: "A", parent_property_id: "b" },
      { id: "b", name: "B", parent_property_id: "a" },
    ];
    expect(resumirUso([{ property_id: "x", total_bytes: 1, object_count: 1 }], []).projetos[0]).toMatchObject({
      id: "x",
      name: "Projeto sem nome",
    });
    expect(resumirUso([{ property_id: "a", total_bytes: 1, object_count: 1 }], ciclo).projetos).toHaveLength(1);
  });

  it("sem linhas, tudo zerado", () => {
    expect(resumirUso([], PROJETOS)).toEqual({ bytes: 0, objetos: 0, projetos: [] });
  });
});

describe("fatiaDoTotal", () => {
  it("dá a porcentagem inteira, com teto e piso", () => {
    expect(fatiaDoTotal(25, 100)).toBe(25);
    expect(fatiaDoTotal(1, 3)).toBe(33);
    expect(fatiaDoTotal(5, 0)).toBe(0);
    expect(fatiaDoTotal(200, 100)).toBe(100);
  });
});
