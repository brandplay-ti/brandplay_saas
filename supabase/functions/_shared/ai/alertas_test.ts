import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { refHora, refMes } from "./alertas.ts";

Deno.test("refMes e refHora para dedupe de alertas", () => {
  const d = new Date("2026-03-15T14:22:33.000Z");
  assertEquals(refMes(d), "2026-03");
  assertEquals(refHora(d), "2026-03-15-14");
});
