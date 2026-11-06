import { describe, expect, it } from "vitest";
import {
  arvoreDeProjetos,
  dataDoInput,
  equipesPorPessoa,
  esquemaDaEquipe,
  fimDoDia,
  vinculoVigente,
} from "./equipes";

describe("arvoreDeProjetos", () => {
  it("põe a mãe antes dos subprojetos, irmãos por nome, com o nível", () => {
    const lista = arvoreDeProjetos([
      { id: "c", name: "Etapa 2", parent_property_id: "a" },
      { id: "a", name: "Copa", parent_property_id: null },
      { id: "b", name: "Etapa 1", parent_property_id: "a" },
      { id: "d", name: "Jogo", parent_property_id: "b" },
      { id: "e", name: "Atleta", parent_property_id: null },
    ]);
    expect(lista.map((p) => [p.id, p.nivel])).toEqual([
      ["e", 0],
      ["a", 0],
      ["b", 1],
      ["d", 2],
      ["c", 1],
    ]);
  });

  it("sobe para a raiz o subprojeto cuja mãe não veio na lista", () => {
    const lista = arvoreDeProjetos([{ id: "b", name: "Etapa", parent_property_id: "fora" }]);
    expect(lista).toEqual([{ id: "b", name: "Etapa", parent_property_id: "fora", nivel: 0 }]);
  });

  it("não trava num ciclo e mostra cada projeto uma vez", () => {
    const lista = arvoreDeProjetos([
      { id: "a", name: "A", parent_property_id: "b" },
      { id: "b", name: "B", parent_property_id: "a" },
    ]);
    expect(lista.map((p) => [p.id, p.nivel])).toEqual([
      ["a", 0],
      ["b", 1],
    ]);
  });
});

describe("vinculoVigente", () => {
  const agora = new Date("2026-11-01T12:00:00Z");

  it("vale enquanto ativo e antes da data de fim", () => {
    expect(vinculoVigente({ status: "ativo", expires_at: null }, agora)).toBe(true);
    expect(vinculoVigente({ status: "ativo", expires_at: "2026-11-02T00:00:00Z" }, agora)).toBe(true);
  });

  it("não vale revogado nem vencido", () => {
    expect(vinculoVigente({ status: "revogado", expires_at: null }, agora)).toBe(false);
    expect(vinculoVigente({ status: "ativo", expires_at: "2026-11-01T11:59:59Z" }, agora)).toBe(false);
  });
});

describe("equipesPorPessoa", () => {
  it("lista só equipes ativas e vínculos vigentes, por nome", () => {
    const agora = new Date("2026-11-01T12:00:00Z");
    const mapa = equipesPorPessoa(
      [
        { id: "t1", name: "Vendas", status: "ativo" },
        { id: "t2", name: "Eventos", status: "ativo" },
        { id: "t3", name: "Antiga", status: "arquivado" },
      ],
      [
        { team_id: "t1", user_id: "u1", status: "ativo", expires_at: null },
        { team_id: "t2", user_id: "u1", status: "ativo", expires_at: null },
        { team_id: "t3", user_id: "u1", status: "ativo", expires_at: null },
        { team_id: "t1", user_id: "u2", status: "revogado", expires_at: null },
        { team_id: "t2", user_id: "u3", status: "ativo", expires_at: "2026-10-01T00:00:00Z" },
      ],
      agora,
    );
    expect(mapa.get("u1")?.map((e) => e.name)).toEqual(["Eventos", "Vendas"]);
    expect(mapa.has("u2")).toBe(false);
    expect(mapa.has("u3")).toBe(false);
  });
});

describe("esquemaDaEquipe", () => {
  it("exige nome e corta espaços", () => {
    expect(esquemaDaEquipe.safeParse({ name: "   ", description: "" }).success).toBe(false);
    expect(esquemaDaEquipe.parse({ name: "  Comercial SP ", description: " " })).toEqual({
      name: "Comercial SP",
      description: "",
    });
  });

  it("limita o tamanho do nome", () => {
    expect(esquemaDaEquipe.safeParse({ name: "x".repeat(81), description: "" }).success).toBe(false);
  });
});

describe("data de fim do vínculo", () => {
  it("vai do input para o fim do dia e volta para o mesmo dia", () => {
    const iso = fimDoDia("2026-12-31");
    expect(iso).not.toBeNull();
    expect(dataDoInput(iso)).toBe("2026-12-31");
  });

  it("ignora valor inválido ou vazio", () => {
    expect(fimDoDia("")).toBeNull();
    expect(fimDoDia("31/12/2026")).toBeNull();
    expect(dataDoInput(null)).toBe("");
  });
});
