// Testes de `ai-crypto.ts` (backlog IA-04). Sem rede e sem ambiente: as
// chaves mestras são geradas aqui e passadas explicitamente.
//
//   deno test supabase/functions/_shared/ai-crypto_test.ts

import { assert, assertEquals, assertNotEquals, assertRejects, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type ChavesMestras,
  chavesMestrasDoAmbiente,
  cifrarChave,
  decifrarChave,
  ErroDeCifra,
  finalDaChave,
} from "./ai-crypto.ts";

const ORG_A = "a4000000-0000-4000-8000-000000000001";
const ORG_B = "b4000000-0000-4000-8000-000000000002";
const CHAVE = "sk-teste-0123456789abcdefWXYZ";

function chaveMestra(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
}

function ambiente(valores: Record<string, string>): (nome: string) => string | undefined {
  return (nome) => valores[nome];
}

function mestras(versaoAtual: number, porVersao: Record<number, string>): ChavesMestras {
  return { versaoAtual, porVersao: new Map(Object.entries(porVersao).map(([v, k]) => [Number(v), k])) };
}

async function codigoDoErro(promessa: Promise<unknown>): Promise<string> {
  const erro = await assertRejects(() => promessa, ErroDeCifra);
  return (erro as ErroDeCifra).codigo;
}

Deno.test("cifra e decifra para o mesmo dono, com a versão atual e o final da chave", async () => {
  const chaves = mestras(1, { 1: chaveMestra() });
  const cifrada = await cifrarChave(`  ${CHAVE}  `, ORG_A, chaves);
  assertEquals(cifrada.version, 1);
  assertEquals(cifrada.hint, "WXYZ");
  assert(!cifrada.ciphertext.includes(CHAVE));
  assertEquals(await decifrarChave(cifrada, ORG_A, chaves), CHAVE);

  const padrao = await cifrarChave(CHAVE, null, chaves);
  assertEquals(await decifrarChave(padrao, null, chaves), CHAVE);
});

Deno.test("IV novo a cada cifragem", async () => {
  const chaves = mestras(1, { 1: chaveMestra() });
  const a = await cifrarChave(CHAVE, ORG_A, chaves);
  const b = await cifrarChave(CHAVE, ORG_A, chaves);
  assertNotEquals(a.iv, b.iv);
  assertNotEquals(a.ciphertext, b.ciphertext);
});

Deno.test("cifra de uma organização não decifra para outra nem como chave padrão", async () => {
  const chaves = mestras(1, { 1: chaveMestra() });
  const daA = await cifrarChave(CHAVE, ORG_A, chaves);
  assertEquals(await codigoDoErro(decifrarChave(daA, ORG_B, chaves)), "falha_ao_decifrar");
  assertEquals(await codigoDoErro(decifrarChave(daA, null, chaves)), "falha_ao_decifrar");
  const padrao = await cifrarChave(CHAVE, null, chaves);
  assertEquals(await codigoDoErro(decifrarChave(padrao, ORG_A, chaves)), "falha_ao_decifrar");
});

Deno.test("chave mestra errada ou cifra adulterada falham sem expor nada", async () => {
  const chaves = mestras(1, { 1: chaveMestra() });
  const cifrada = await cifrarChave(CHAVE, ORG_A, chaves);

  const outra = mestras(1, { 1: chaveMestra() });
  const erro = await assertRejects(() => decifrarChave(cifrada, ORG_A, outra), ErroDeCifra);
  assertEquals((erro as ErroDeCifra).codigo, "falha_ao_decifrar");
  assert(!erro.message.includes(CHAVE) && !erro.message.includes(cifrada.ciphertext));

  const bytes = Uint8Array.from(atob(cifrada.ciphertext), (c) => c.charCodeAt(0));
  bytes[0] ^= 1;
  const adulterada = { ...cifrada, ciphertext: btoa(String.fromCharCode(...bytes)) };
  assertEquals(await codigoDoErro(decifrarChave(adulterada, ORG_A, chaves)), "falha_ao_decifrar");
});

Deno.test("rotação: grava com a versão atual e ainda decifra a anterior", async () => {
  const v1 = chaveMestra();
  const v2 = chaveMestra();
  const antes = await cifrarChave(CHAVE, ORG_A, mestras(1, { 1: v1 }));

  const env = chavesMestrasDoAmbiente(ambiente({
    AI_KEYS_MASTER_KEY: v2,
    AI_KEYS_MASTER_KEY_VERSION: "2",
    AI_KEYS_PREVIOUS_MASTER_KEYS: `1:${v1}`,
  }));
  assertEquals(await decifrarChave(antes, ORG_A, env), CHAVE);
  const depois = await cifrarChave(CHAVE, ORG_A, env);
  assertEquals(depois.version, 2);

  // Sem a anterior configurada, a versão 1 é desconhecida.
  const soV2 = chavesMestrasDoAmbiente(ambiente({ AI_KEYS_MASTER_KEY: v2, AI_KEYS_MASTER_KEY_VERSION: "2" }));
  assertEquals(await codigoDoErro(decifrarChave(antes, ORG_A, soV2)), "versao_desconhecida");
});

Deno.test("ambiente: ausente, tamanho errado, base64 inválido e formato das anteriores", () => {
  const codigo = (valores: Record<string, string>) =>
    (assertThrows(() => chavesMestrasDoAmbiente(ambiente(valores)), ErroDeCifra) as ErroDeCifra).codigo;

  assertEquals(codigo({}), "chave_mestra_ausente");
  assertEquals(codigo({ AI_KEYS_MASTER_KEY: "   " }), "chave_mestra_ausente");
  assertEquals(codigo({ AI_KEYS_MASTER_KEY: btoa("curta-demais") }), "chave_mestra_invalida");
  assertEquals(codigo({ AI_KEYS_MASTER_KEY: "%%%nao-e-base64%%%" }), "chave_mestra_invalida");
  assertEquals(codigo({ AI_KEYS_MASTER_KEY: chaveMestra(), AI_KEYS_MASTER_KEY_VERSION: "0" }), "chave_mestra_invalida");
  assertEquals(codigo({ AI_KEYS_MASTER_KEY: chaveMestra(), AI_KEYS_PREVIOUS_MASTER_KEYS: "sem-versao" }), "chave_mestra_invalida");
  assertEquals(
    codigo({ AI_KEYS_MASTER_KEY: chaveMestra(), AI_KEYS_PREVIOUS_MASTER_KEYS: `1:${btoa("curta")}` }),
    "chave_mestra_invalida",
  );

  const ok = chavesMestrasDoAmbiente(ambiente({ AI_KEYS_MASTER_KEY: chaveMestra() }));
  assertEquals(ok.versaoAtual, 1);
});

Deno.test("chave de API curta demais é recusada", async () => {
  const chaves = mestras(1, { 1: chaveMestra() });
  assertEquals(await codigoDoErro(cifrarChave("sk-1234", ORG_A, chaves)), "chave_invalida");
  assertEquals(finalDaChave(` ${CHAVE} `), "WXYZ");
});
