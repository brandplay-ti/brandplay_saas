// Testes das guardas antes da chamada (backlog IA-10), com a consulta ao
// banco simulada. A regra de cada bloqueio é testada no SQL (tests/ia.sql);
// aqui, a ordem, o limite de taxa e a falha fechada.
//
//   deno test --allow-read supabase/functions/_shared/ai/

import { assert, assertEquals, assertRejects, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  AcessoNegadoAIA,
  type ConsultaDeSituacao,
  LIMITE_POR_MINUTO_ORGANIZACAO,
  LIMITE_POR_MINUTO_USUARIO,
  lerSituacao,
  type SituacaoDeIA,
  verificarGuardas,
} from "./guardas.ts";
import { ErroDeIA } from "./erros.ts";
import type { ContextoDeIA } from "./tipos.ts";

const CONTEXTO: ContextoDeIA = { organizacaoId: "a6000000-0000-4000-8000-000000000001", usuarioId: "u1" };

/** O jsonb de `ia_situacao`, com os nomes do banco. */
function jsonDaSituacao(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    bloqueio: null,
    ia_habilitada: true,
    plano: "pro",
    chave_exclusiva: false,
    orcamento_cents: 10000,
    alerta_pct: 80,
    corta_ao_esgotar: true,
    gasto_mes_brl: 12.5,
    alerta_atingido: false,
    orcamento_esgotado: false,
    requisicoes_minuto_org: 3,
    requisicoes_minuto_usuario: 1,
    ...extra,
  };
}

function consulta(json: Record<string, unknown> | Error): ConsultaDeSituacao & { vistos: ContextoDeIA[] } {
  const vistos: ContextoDeIA[] = [];
  return {
    vistos,
    situacao(contexto) {
      vistos.push(contexto);
      return json instanceof Error ? Promise.reject(json) : Promise.resolve(lerSituacao(json));
    },
  };
}

async function erroDe(promessa: Promise<unknown>): Promise<ErroDeIA> {
  return (await assertRejects(() => promessa, ErroDeIA)) as ErroDeIA;
}

Deno.test("situação liberada passa e volta lida, com o contexto repassado à consulta", async () => {
  const c = consulta(jsonDaSituacao({ gasto_mes_brl: "12.5", alerta_atingido: true }));
  const s: SituacaoDeIA = await verificarGuardas(CONTEXTO, c);
  assertEquals(c.vistos, [CONTEXTO]);
  assertEquals(
    [s.bloqueio, s.orcamentoCents, s.alertaPct, s.gastoMesBrl, s.alertaAtingido, s.requisicoesMinutoOrganizacao],
    [null, 10000, 80, 12.5, true, 3],
  );
  // Sem orçamento: nulo, não zero (zero seria "sem IA").
  assertEquals((await verificarGuardas(CONTEXTO, consulta(jsonDaSituacao({ orcamento_cents: null })))).orcamentoCents, null);
});

Deno.test("bloqueios da ia_situacao viram o erro da categoria, sem nova tentativa", async () => {
  const casos: [string, number][] = [["ia_desabilitada", 403], ["cobranca_bloqueada", 402], ["orcamento_esgotado", 402]];
  for (const [bloqueio, status] of casos) {
    const erro = await erroDe(verificarGuardas(CONTEXTO, consulta(jsonDaSituacao({ bloqueio }))));
    assertEquals([erro.codigo, erro.status, erro.tentarDeNovo, erro.daCredencial], [bloqueio, status, false, false]);
  }
  // Chave exclusiva com orçamento estourado: o banco não bloqueia (Q5) e a guarda deixa passar.
  const s = await verificarGuardas(CONTEXTO, consulta(jsonDaSituacao({ chave_exclusiva: true, orcamento_esgotado: true })));
  assert(s.orcamentoEsgotado && s.bloqueio === null);
});

Deno.test("limite de taxa por organização e por usuário; rotina sem usuário só pelo da organização", async () => {
  const org = await erroDe(verificarGuardas(CONTEXTO, consulta(jsonDaSituacao({ requisicoes_minuto_org: LIMITE_POR_MINUTO_ORGANIZACAO }))));
  assertEquals([org.codigo, org.tentarDeNovo, org.daCredencial], ["limite_taxa", false, false]);

  const usuario = await erroDe(verificarGuardas(CONTEXTO, consulta(jsonDaSituacao({ requisicoes_minuto_usuario: LIMITE_POR_MINUTO_USUARIO }))));
  assertEquals(usuario.codigo, "limite_taxa");

  await verificarGuardas({ ...CONTEXTO, usuarioId: null }, consulta(jsonDaSituacao({ requisicoes_minuto_usuario: 999 })));
  await verificarGuardas(CONTEXTO, consulta(jsonDaSituacao({ requisicoes_minuto_org: LIMITE_POR_MINUTO_ORGANIZACAO - 1, requisicoes_minuto_usuario: LIMITE_POR_MINUTO_USUARIO - 1 })));
});

Deno.test("falha fechada: consulta com erro ou formato inesperado barra a chamada", async () => {
  assertEquals((await erroDe(verificarGuardas(CONTEXTO, consulta(new Error("conexão caiu"))))).codigo, "indisponivel");
  for (const ruim of [null, [], "texto", { bloqueio: "inventado" }]) {
    const erro = assertThrows(() => lerSituacao(ruim), ErroDeIA) as ErroDeIA;
    assertEquals(erro.codigo, "indisponivel");
  }
  // Quem não é membro sobe como acesso negado (403), não como falha da IA.
  await assertRejects(() => verificarGuardas(CONTEXTO, consulta(new AcessoNegadoAIA())), AcessoNegadoAIA);
});
