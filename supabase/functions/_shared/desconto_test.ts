import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { DescontoInvalido, descontoAindaVigente, validarComentario, validarDesconto } from "./desconto.ts";

Deno.test("100% por 12 meses é isenção válida", () => {
  assertEquals(validarDesconto({ percent_off: 100, duration_months: 12, comment: "  cortesia  " }), {
    percentOff: 100,
    durationMonths: 12,
    comment: "cortesia",
  });
});

Deno.test("recusa percentual, prazo e motivo fora da regra", () => {
  assertThrows(() => validarDesconto({ percent_off: 0, duration_months: 1, comment: "motivo" }), DescontoInvalido);
  assertThrows(() => validarDesconto({ percent_off: 10.5, duration_months: 1, comment: "motivo" }), DescontoInvalido);
  assertThrows(() => validarDesconto({ percent_off: 10, duration_months: 13, comment: "motivo" }), DescontoInvalido);
  assertThrows(() => validarComentario("  ab "), DescontoInvalido);
});

Deno.test("a vigência acaba N meses de calendário depois", () => {
  const inicio = "2026-01-31T12:00:00.000Z";
  // 31 de janeiro + 1 mês UTC estoura fevereiro e cai em 3 de março.
  const fim = Date.parse("2026-03-03T12:00:00.000Z");
  assertEquals(descontoAindaVigente(inicio, 1, fim - 1000), true);
  assertEquals(descontoAindaVigente(inicio, 1, fim), false);
  assertEquals(descontoAindaVigente("nao-e-data", 1), false);
});
