import { describe, expect, it } from "vitest";
import {
  arvoreAchatada,
  caminhoAte,
  conteudoParaArquivar,
  conteudoParaDesarquivar,
  destinosDaMidia,
  destinosDaPasta,
  erroNoNomeDaPasta,
  filhasDe,
  maeArquivada,
  subarvore,
  type MidiaNaPasta,
  type PastaDaEdicao,
} from "./pastasDaEdicao";

const pasta = (id: string, name: string, parent: string | null = null, archived_at: string | null = null): PastaDaEdicao => ({
  id,
  name,
  parent_folder_id: parent,
  archived_at,
});

// Jogo 10 e Jogo 2 (ordem numérica); Jogo 2 › Câmera 1 › Close; Jogo 2 › Câmera 2.
const PASTAS = [
  pasta("j10", "Jogo 10"),
  pasta("j2", "Jogo 2"),
  pasta("c1", "Câmera 1", "j2"),
  pasta("close", "Close", "c1"),
  pasta("c2", "Câmera 2", "j2"),
  pasta("velha", "Antiga", null, "2026-01-01T00:00:00Z"),
];

const midia = (id: string, folder_id: string | null, archived_at: string | null = null): MidiaNaPasta => ({
  id,
  folder_id,
  archived_at,
});

describe("filhasDe", () => {
  it("lista o nível pedido em ordem de nome, com números em ordem natural", () => {
    expect(filhasDe(PASTAS, null).map((p) => p.id)).toEqual(["velha", "j2", "j10"]);
    expect(filhasDe(PASTAS, "j2").map((p) => p.id)).toEqual(["c1", "c2"]);
    expect(filhasDe(PASTAS, "close")).toEqual([]);
  });
});

describe("caminhoAte", () => {
  it("vai da raiz até a pasta", () => {
    expect(caminhoAte(PASTAS, "close").map((p) => p.name)).toEqual(["Jogo 2", "Câmera 1", "Close"]);
    expect(caminhoAte(PASTAS, null)).toEqual([]);
    expect(caminhoAte(PASTAS, "nao-existe")).toEqual([]);
  });

  it("não gira em cadeia com ciclo", () => {
    const ciclo = [pasta("a", "A", "b"), pasta("b", "B", "a")];
    expect(caminhoAte(ciclo, "a").map((p) => p.id)).toEqual(["b", "a"]);
  });
});

describe("subarvore", () => {
  it("inclui a pasta e todas as descendentes", () => {
    expect([...subarvore(PASTAS, "j2")].sort()).toEqual(["c1", "c2", "close", "j2"]);
    expect([...subarvore(PASTAS, "close")]).toEqual(["close"]);
  });
});

describe("arvoreAchatada", () => {
  it("põe cada pasta antes das filhas, com o nível", () => {
    const ativas = PASTAS.filter((p) => !p.archived_at);
    expect(arvoreAchatada(ativas).map((p) => `${p.nivel}:${p.id}`)).toEqual(["0:j2", "1:c1", "2:close", "1:c2", "0:j10"]);
  });

  it("trata como raiz a pasta cuja mãe não está na lista", () => {
    expect(arvoreAchatada([pasta("x", "X", "fora")]).map((p) => p.nivel)).toEqual([0]);
  });
});

describe("destinosDaPasta", () => {
  it("tira a própria pasta, as descendentes, a mãe atual e as arquivadas", () => {
    const destinos = destinosDaPasta(PASTAS, "c1").map((d) => d?.id ?? "raiz");
    expect(destinos).toEqual(["raiz", "c2", "j10"]);
  });

  it("pasta na raiz não oferece a raiz", () => {
    expect(destinosDaPasta(PASTAS, "j10").map((d) => d?.id ?? "raiz")).toEqual(["j2", "c1", "close", "c2"]);
  });
});

describe("destinosDaMidia", () => {
  it("oferece a raiz e as pastas ativas, menos a atual", () => {
    expect(destinosDaMidia(PASTAS, "c2").map((d) => d?.id ?? "raiz")).toEqual(["raiz", "j2", "c1", "close", "j10"]);
    expect(destinosDaMidia(PASTAS, null).map((d) => d?.id ?? "raiz")).not.toContain("raiz");
  });
});

describe("erroNoNomeDaPasta", () => {
  const irmas = filhasDe(PASTAS, "j2");

  it("exige nome e limita o tamanho", () => {
    expect(erroNoNomeDaPasta("   ", irmas)).toBe("Dê um nome à pasta.");
    expect(erroNoNomeDaPasta("a".repeat(121), irmas)).toBe("Use até 120 caracteres.");
    expect(erroNoNomeDaPasta("a".repeat(120), irmas)).toBeNull();
  });

  it("recusa caractere de controle", () => {
    expect(erroNoNomeDaPasta("Jogo\u00071", irmas)).toBe("O nome tem um caractere inválido.");
  });

  it("recusa nome repetido no mesmo nível, sem diferença de maiúsculas", () => {
    expect(erroNoNomeDaPasta(" câmera 1 ", irmas)).toBe("Já existe uma pasta com esse nome aqui.");
    expect(erroNoNomeDaPasta("Câmera 3", irmas)).toBeNull();
  });

  it("aceita o próprio nome ao renomear e o nome de uma pasta arquivada", () => {
    expect(erroNoNomeDaPasta("Câmera 1", irmas, "c1")).toBeNull();
    expect(erroNoNomeDaPasta("antiga", filhasDe(PASTAS, null))).toBeNull();
  });
});

describe("conteudoParaArquivar", () => {
  it("arquiva arquivos ativos e pastas de baixo para cima", () => {
    const midias = [midia("m1", "close"), midia("m2", "j2"), midia("m3", "j10"), midia("m4", "c2", "2026-01-01")];
    const conteudo = conteudoParaArquivar(PASTAS, midias, "j2");
    expect(conteudo.midias.sort()).toEqual(["m1", "m2"]);
    expect(conteudo.pastas.indexOf("close")).toBeLessThan(conteudo.pastas.indexOf("c1"));
    expect(conteudo.pastas.indexOf("c1")).toBeLessThan(conteudo.pastas.indexOf("j2"));
    expect(conteudo.pastas.at(-1)).toBe("j2");
    expect(conteudo.pastas).toHaveLength(4);
  });
});

describe("conteudoParaDesarquivar", () => {
  it("devolve as pastas de cima para baixo e os arquivos arquivados", () => {
    const arquivadas = PASTAS.map((p) => (subarvore(PASTAS, "j2").has(p.id) ? { ...p, archived_at: "2026-02-01" } : p));
    const midias = [midia("m1", "close", "2026-02-01"), midia("m2", "j2")];
    const conteudo = conteudoParaDesarquivar(arquivadas, midias, "j2");
    expect(conteudo.pastas[0]).toBe("j2");
    expect(conteudo.pastas.indexOf("c1")).toBeLessThan(conteudo.pastas.indexOf("close"));
    expect(conteudo.midias).toEqual(["m1"]);
  });
});

describe("maeArquivada", () => {
  it("diz se a pasta-mãe está arquivada", () => {
    const comMaeArquivada = [pasta("m", "Mãe", null, "2026-01-01"), pasta("f", "Filha", "m", "2026-01-01")];
    expect(maeArquivada(comMaeArquivada, "f")).toBe(true);
    expect(maeArquivada(comMaeArquivada, "m")).toBe(false);
    expect(maeArquivada(PASTAS, "c1")).toBe(false);
  });
});
