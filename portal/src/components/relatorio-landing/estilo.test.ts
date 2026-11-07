import { describe, expect, it } from "vitest";
import { comInicialMaiuscula, diaEMes, periodoDaPropriedade } from "./estilo";
import type { PaginaRelatorio } from "@/lib/relatorioLanding";

const propriedade = (p: Partial<NonNullable<PaginaRelatorio["propriedade"]>>): PaginaRelatorio["propriedade"] => ({
  nome: "Copa",
  categoria: "campeonato",
  chamada: null,
  sobre: null,
  capa_url: null,
  temporada: null,
  inicio: null,
  fim: null,
  locais: null,
  local_final: null,
  publico_estimado: null,
  torcedores: null,
  participantes: null,
  times: null,
  premiacao: null,
  ...p,
});

describe("datas da página", () => {
  it("escreve o período sem capitalizar cada palavra", () => {
    expect(periodoDaPropriedade(propriedade({ inicio: "2026-03-14", fim: "2026-09-27" }))).toBe("Mar 2026 – Set 2026");
    expect(periodoDaPropriedade(propriedade({ inicio: "2026-03-14" }))).toBe("Desde Mar 2026");
    expect(periodoDaPropriedade(propriedade({ temporada: 2026 }))).toBe("Temporada 2026");
    expect(periodoDaPropriedade(null)).toBeNull();
  });

  it("dia e mês da jornada", () => {
    // Meio do dia em UTC: o mesmo dia no Brasil e no CI.
    expect(diaEMes("2026-04-03T15:00:00Z")).toBe("03 abr");
  });

  it("só a primeira letra maiúscula", () => {
    expect(comInicialMaiuscula("campeonato de várzea")).toBe("Campeonato de várzea");
  });
});
