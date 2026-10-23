// Testes do apoio às funções de IA (épico 3). Sem rede nem banco.
//
//   deno test --allow-read supabase/functions/_shared/ai/

import { assert, assertEquals, assertRejects, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ErroDeIA } from "./erros.ts";
import { type ClienteDeRpc, ErroDaRequisicao, exigirModulo, organizacaoDoCorpo, respostaDeFalha, uuidDoCorpo } from "./funcao.ts";
import { AcessoNegadoAIA } from "./guardas.ts";

const ORG = "c1000000-0000-4000-8000-000000000001";
const USUARIO = "c1000000-0000-4000-8000-0000000000aa";

Deno.test("organização e ids do corpo: só uuid, senão 400", () => {
  assertEquals(organizacaoDoCorpo({ organization_id: ORG }), ORG);
  assertEquals(uuidDoCorpo({ sponsor_id: ORG }, "sponsor_id"), ORG);
  for (const corpo of [{}, null, { organization_id: "" }, { organization_id: 1 }, { organization_id: "' or 1=1" }]) {
    const e = assertThrows(() => organizacaoDoCorpo(corpo), ErroDaRequisicao);
    assertEquals(e.status, 400);
  }
});

function cliente(respostas: Record<string, { data: unknown; error?: { code: string } }>, chamadas: unknown[] = []): ClienteDeRpc {
  return {
    rpc: (fn, args) => {
      chamadas.push([fn, args]);
      const r = respostas[fn];
      return Promise.resolve({ data: r?.data ?? null, error: r?.error ?? null });
    },
  };
}

Deno.test("exigirModulo: membro com acesso passa, com o usuário e a organização repassados às funções das policies", async () => {
  const chamadas: unknown[] = [];
  await exigirModulo(cliente({ is_org_member: { data: true }, can_access_module: { data: true } }, chamadas), USUARIO, ORG, "crm");
  assertEquals(chamadas, [
    ["is_org_member", { _user_id: USUARIO, _org_id: ORG }],
    ["can_access_module", { _user_id: USUARIO, _org_id: ORG, _module: "crm", _write: false }],
  ]);
});

Deno.test("exigirModulo: não membro, sem módulo ou consulta com falha não seguem", async () => {
  const naoMembro = await assertRejects(
    () => exigirModulo(cliente({ is_org_member: { data: false }, can_access_module: { data: false } }), USUARIO, ORG, "crm"),
    ErroDaRequisicao,
  );
  assertEquals(naoMembro.status, 403);

  const semModulo = await assertRejects(
    () => exigirModulo(cliente({ is_org_member: { data: true }, can_access_module: { data: false } }), USUARIO, ORG, "financeiro"),
    ErroDaRequisicao,
  );
  assertEquals(semModulo.status, 403);

  await assertRejects(
    () => exigirModulo(cliente({ is_org_member: { data: null, error: { code: "42501" } }, can_access_module: { data: true } }), USUARIO, ORG, "crm"),
    Error,
    "validação de acesso falhou",
  );
});

Deno.test("respostaDeFalha: erro de IA vira { error, codigo } com o status do catálogo, sem o detalhe interno", async () => {
  const r = respostaDeFalha(new ErroDeIA("orcamento_esgotado", "detalhe interno 9f3a", false, "plataforma"), "teste");
  assertEquals(r.status, 402);
  const corpo = await r.json();
  assertEquals(corpo.codigo, "orcamento_esgotado");
  assert(!JSON.stringify(corpo).includes("9f3a"));
  assertEquals(r.headers.get("Access-Control-Allow-Origin"), "*");
});

Deno.test("respostaDeFalha: acesso negado, requisição inválida e falha inesperada", async () => {
  const negado = respostaDeFalha(new AcessoNegadoAIA(), "teste");
  assertEquals([negado.status, (await negado.json()).codigo], [403, undefined]);

  const invalida = respostaDeFalha(new ErroDaRequisicao(404, "Conta não encontrada"), "teste");
  assertEquals([invalida.status, (await invalida.json()).error], [404, "Conta não encontrada"]);

  const inesperada = respostaDeFalha(new Error("relation sponsors_x does not exist SEGREDO-7b1c"), "teste");
  assertEquals(inesperada.status, 500);
  assert(!(await inesperada.text()).includes("SEGREDO-7b1c"));
});
