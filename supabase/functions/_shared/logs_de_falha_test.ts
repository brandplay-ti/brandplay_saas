import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  acaoNormalizada,
  chavesNormalizadas,
  LIMITES,
  linhaNormalizada,
  organizacaoConfirmada,
  textoLimitado,
  uuidOuNulo,
} from "./logs_de_falha.ts";

const ORG = "a2000000-0000-4000-8000-000000000001";
const USER = "2a000000-0000-4000-8000-00000000000a";

Deno.test("texto livre tem teto e vazio vira nulo", () => {
  assertEquals(textoLimitado("  falha  ", 10), "falha");
  assertEquals(textoLimitado("x".repeat(50), 10), "x".repeat(10));
  assertEquals(textoLimitado("   ", 10), null);
  assertEquals(textoLimitado(42, 10), null);
  assertEquals(textoLimitado({ a: 1 }, 10), null);
});

Deno.test("ação fora das quatro do banco vira unknown", () => {
  assertEquals(acaoNormalizada("insert"), "INSERT");
  assertEquals(acaoNormalizada(" Delete "), "DELETE");
  assertEquals(acaoNormalizada("DROP TABLE"), "unknown");
  assertEquals(acaoNormalizada(undefined), "unknown");
});

Deno.test("linha só inteiro positivo", () => {
  assertEquals(linhaNormalizada(42), 42);
  assertEquals(linhaNormalizada(0), null);
  assertEquals(linhaNormalizada(1.5), null);
  assertEquals(linhaNormalizada("42"), null);
});

Deno.test("chaves tentadas: só texto, com teto", () => {
  assertEquals(chavesNormalizadas(["name", 1, null, "  ", "id"]), ["name", "id"]);
  assertEquals(chavesNormalizadas("name"), []);
  assertEquals(chavesNormalizadas(Array.from({ length: 80 }, (_, i) => `c${i}`)).length, LIMITES.chaves);
});

Deno.test("uuid inválido não passa", () => {
  assertEquals(uuidOuNulo(ORG), ORG);
  assertEquals(uuidOuNulo("org-a"), null);
  assertEquals(uuidOuNulo(null), null);
});

Deno.test("organização só fica quando o usuário é membro dela", async () => {
  const membro = (org: string, user: string) => Promise.resolve(org === ORG && user === USER);
  assertEquals(await organizacaoConfirmada(ORG, USER, membro), { organizationId: ORG, descartada: false });
  assertEquals(
    await organizacaoConfirmada("b2000000-0000-4000-8000-000000000002", USER, membro),
    { organizationId: null, descartada: true },
  );
  assertEquals(await organizacaoConfirmada(ORG, null, membro), { organizationId: null, descartada: true });
  assertEquals(await organizacaoConfirmada(null, USER, membro), { organizationId: null, descartada: false });
  assertEquals(await organizacaoConfirmada("nao-uuid", USER, membro), { organizationId: null, descartada: true });
  const quebrado = () => Promise.reject(new Error("banco fora"));
  assertEquals(await organizacaoConfirmada(ORG, USER, quebrado), { organizationId: null, descartada: true });
});
