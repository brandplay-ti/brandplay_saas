// Testes da resolução da credencial e da chamada com nova tentativa
// (backlog IA-09). Repositório e adaptadores falsos; a cifra é a real.
//
//   deno test --allow-read supabase/functions/_shared/ai/

import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { type ChavesMestras, cifrarChave } from "../ai-crypto.ts";
import {
  chamarComCredencial,
  type CredencialResolvida,
  ESPERAS_ENTRE_TENTATIVAS,
  type LinhaDeCredencial,
  type RepositorioDeCredenciais,
  resolverCredencial,
} from "./credencial.ts";
import { type ErroDoFornecedor, ErroDeIA } from "./erros.ts";
import { MODELOS_PADRAO } from "./modelos.ts";
import type { Adaptador, ChamadaAoFornecedor, Fornecedor, PedidoDeIA, RespostaDeIA } from "./tipos.ts";

const ORG_A = "a5000000-0000-4000-8000-000000000001";
const ORG_B = "b5000000-0000-4000-8000-000000000002";
const CHAVE_A = "sk-exclusiva-da-org-a-0001";
const CHAVE_PADRAO = "sk-padrao-da-plataforma-0002";

const MESTRAS: ChavesMestras = {
  versaoAtual: 1,
  porVersao: new Map([[1, btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))]]),
};

async function linha(
  dono: string | null,
  chave: string,
  extra: Partial<LinhaDeCredencial> = {},
  cifrarPara: string | null = dono,
): Promise<LinhaDeCredencial> {
  const c = await cifrarChave(chave, cifrarPara, MESTRAS);
  return {
    id: `cred-${dono ?? "padrao"}`,
    organization_id: dono,
    provider: "openai",
    key_ciphertext: c.ciphertext,
    key_iv: c.iv,
    key_version: c.version,
    model_rapido: "m-rapido",
    model_padrao: "m-padrao",
    model_visao: "m-visao",
    last_error: null,
    ...extra,
  };
}

class RepositorioFalso implements RepositorioDeCredenciais {
  erros: [string, ErroDoFornecedor | null][] = [];
  consultas: string[] = [];
  constructor(private exclusivas: Record<string, LinhaDeCredencial>, private padrao: LinhaDeCredencial | null) {}
  ativaDaOrganizacao(organizacaoId: string) {
    this.consultas.push(organizacaoId);
    return Promise.resolve(this.exclusivas[organizacaoId] ?? null);
  }
  padraoAtiva() {
    return Promise.resolve(this.padrao);
  }
  registrarErro(id: string, codigo: ErroDoFornecedor | null) {
    this.erros.push([id, codigo]);
    return Promise.resolve();
  }
}

const IMAGEM = "data:image/png;base64,iVBORw0KGgo=";

function pedido(extra: Partial<PedidoDeIA> = {}): PedidoDeIA {
  return { funcionalidade: "teste", nivel: "padrao", mensagens: [{ papel: "usuario", conteudo: "Olá" }], maxTokens: 256, ...extra };
}

const comImagem = pedido({
  nivel: "visao",
  mensagens: [{ papel: "usuario", conteudo: [{ tipo: "imagem", dataUrl: IMAGEM }] }],
});

function semAmbiente(): (nome: string) => string | undefined {
  return () => undefined;
}

async function resolver(repo: RepositorioDeCredenciais, org: string, p = pedido(), ambiente = semAmbiente()) {
  return await resolverCredencial(org, p, { repositorio: repo, chavesMestras: () => MESTRAS, lerAmbiente: ambiente });
}

async function erroDe(promessa: Promise<unknown>): Promise<ErroDeIA> {
  return (await assertRejects(() => promessa, ErroDeIA)) as ErroDeIA;
}

// ─── Resolução ───────────────────────────────────────────────────────

Deno.test("chave exclusiva ativa vem primeiro, decifrada para a organização, com o modelo do nível", async () => {
  const repo = new RepositorioFalso({ [ORG_A]: await linha(ORG_A, CHAVE_A, { provider: "gemini" }) }, await linha(null, CHAVE_PADRAO));
  const r = await resolver(repo, ORG_A, pedido({ nivel: "rapido" }));
  assertEquals(
    [r.fornecedor, r.chave, r.modelo, r.escopo, r.credencialId],
    ["gemini", CHAVE_A, "m-rapido", "exclusiva", `cred-${ORG_A}`],
  );
  assertEquals(repo.consultas, [ORG_A]);
});

Deno.test("sem exclusiva, vale a chave padrão do banco; sem ela, a semente do ambiente", async () => {
  const comPadrao = new RepositorioFalso({}, await linha(null, CHAVE_PADRAO, { provider: "anthropic" }));
  const p = await resolver(comPadrao, ORG_A);
  assertEquals([p.fornecedor, p.chave, p.modelo, p.escopo, p.credencialId], ["anthropic", CHAVE_PADRAO, "m-padrao", "padrao", "cred-padrao"]);

  const vazio = new RepositorioFalso({}, null);
  const ambiente = (valores: Record<string, string>) => (nome: string) => valores[nome];
  const s = await resolver(vazio, ORG_A, pedido(), ambiente({ AI_DEFAULT_PROVIDER: "gemini", AI_DEFAULT_API_KEY: " sk-semente " }));
  assertEquals([s.fornecedor, s.chave, s.modelo, s.escopo, s.credencialId], ["gemini", "sk-semente", MODELOS_PADRAO.gemini.padrao, "semente", null]);

  const sobrescrito = await resolver(vazio, ORG_A, pedido(), ambiente({
    AI_DEFAULT_PROVIDER: "openai",
    AI_DEFAULT_API_KEY: "sk-semente",
    AI_DEFAULT_MODEL_PADRAO: "gpt-outro",
  }));
  assertEquals(sobrescrito.modelo, "gpt-outro");

  assertEquals((await erroDe(resolver(vazio, ORG_A, pedido(), ambiente({ AI_DEFAULT_PROVIDER: "deepseek", AI_DEFAULT_API_KEY: "x" })))).codigo, "indisponivel");
  assertEquals((await erroDe(resolver(vazio, ORG_A))).codigo, "indisponivel");
});

Deno.test("Q4: exclusiva sem modelo de visão → só a chamada com imagem vai pela padrão, marcada via_padrao", async () => {
  const exclusiva = await linha(ORG_A, CHAVE_A, { model_visao: null });
  const repo = new RepositorioFalso({ [ORG_A]: exclusiva }, await linha(null, CHAVE_PADRAO));
  const visao = await resolver(repo, ORG_A, comImagem);
  assertEquals([visao.chave, visao.modelo, visao.escopo], [CHAVE_PADRAO, "m-visao", "via_padrao"]);
  // Pedido sem imagem continua na exclusiva.
  assertEquals((await resolver(repo, ORG_A)).escopo, "exclusiva");

  // Mesmo vindo da semente, a passagem continua marcada como via_padrao.
  const soSemente = new RepositorioFalso({ [ORG_A]: exclusiva }, null);
  const r = await resolver(soSemente, ORG_A, comImagem, (n) => ({ AI_DEFAULT_PROVIDER: "openai", AI_DEFAULT_API_KEY: "sk-semente" })[n]);
  assertEquals([r.escopo, r.credencialId], ["via_padrao", null]);

  // Padrão também sem visão: não há quem atenda.
  const nenhum = new RepositorioFalso({ [ORG_A]: exclusiva }, await linha(null, CHAVE_PADRAO, { model_visao: null }));
  assertEquals((await erroDe(resolver(nenhum, ORG_A, comImagem))).codigo, "indisponivel");
});

Deno.test("credencial de um cliente nunca serve para outro, e falha da exclusiva não cai na padrão", async () => {
  // Linha da Org A cifrada para a Org B (cópia indevida no banco): não decifra.
  const copiada = await linha(ORG_A, CHAVE_A, {}, ORG_B);
  const repo = new RepositorioFalso({ [ORG_A]: copiada }, await linha(null, CHAVE_PADRAO));
  const erro = await erroDe(resolver(repo, ORG_A));
  assertEquals(erro.codigo, "chave_invalida");
  assert(!erro.message.includes(CHAVE_A) && !erro.message.includes(CHAVE_PADRAO));

  // Repositório devolvendo linha de outra organização: recusada antes de decifrar.
  const trocada = new RepositorioFalso({ [ORG_A]: await linha(ORG_B, CHAVE_A) }, null);
  assertEquals((await erroDe(resolver(trocada, ORG_A))).codigo, "chave_invalida");

  // "Padrão" com organização: recusada.
  const padraoErrada = new RepositorioFalso({}, await linha(ORG_B, CHAVE_PADRAO));
  assertEquals((await erroDe(resolver(padraoErrada, ORG_A))).codigo, "chave_invalida");

  // Chave mestra errada para a padrão: chave_invalida, sem expor nada.
  const outraMestra: ChavesMestras = { versaoAtual: 1, porVersao: new Map([[1, btoa("x".repeat(32))]]) };
  const padrao = new RepositorioFalso({}, await linha(null, CHAVE_PADRAO));
  const e = await erroDe(resolverCredencial(ORG_A, pedido(), { repositorio: padrao, chavesMestras: () => outraMestra, lerAmbiente: semAmbiente() }));
  assertEquals(e.codigo, "chave_invalida");
});

// ─── Chamada ─────────────────────────────────────────────────────────

function credencial(extra: Partial<CredencialResolvida> = {}): CredencialResolvida {
  return { fornecedor: "openai", chave: CHAVE_A, modelo: "m", escopo: "exclusiva", credencialId: "cred-1", ultimoErro: null, ...extra };
}

function resposta(modelo: string): RespostaDeIA {
  return { texto: "ok", chamadas: [], fimPor: "fim", fornecedor: "openai", modelo, uso: { entrada: 1, saida: 1, entradaCache: 0, escritaCache: 0 } };
}

/** Adaptador que falha com os códigos dados, em ordem, e depois responde. */
function adaptadorRoteiro(falhas: (ErroDeIA | Error)[], chamadas: ChamadaAoFornecedor[]): Record<Fornecedor, Adaptador> {
  const adaptador: Adaptador = (c) => {
    chamadas.push(c);
    const falha = falhas.shift();
    return falha ? Promise.reject(falha) : Promise.resolve(resposta(c.modelo));
  };
  return { openai: adaptador, gemini: adaptador, anthropic: adaptador };
}

Deno.test("falha transitória tenta de novo com a mesma credencial e espera crescente; sucesso limpa a falha antiga", async () => {
  const repo = new RepositorioFalso({}, null);
  const chamadas: ChamadaAoFornecedor[] = [];
  const esperas: number[] = [];
  const r = await chamarComCredencial(credencial({ ultimoErro: "sem_saldo" }), pedido(), {
    repositorio: repo,
    adaptadores: adaptadorRoteiro([
      new ErroDeIA("limite_taxa", "openai respondeu HTTP 429", true),
      new ErroDeIA("indisponivel", "openai respondeu HTTP 503", true),
    ], chamadas),
    esperar: (ms) => {
      esperas.push(ms);
      return Promise.resolve();
    },
  });
  assertEquals(r.texto, "ok");
  assertEquals(chamadas.length, 3);
  assert(chamadas.every((c) => c.chave === CHAVE_A && c.fornecedor === "openai"));
  assertEquals(esperas, ESPERAS_ENTRE_TENTATIVAS);
  assertEquals(repo.erros, [["cred-1", null]]);
});

Deno.test("esgotadas as tentativas, a falha é registrada na credencial e devolvida", async () => {
  const repo = new RepositorioFalso({}, null);
  const chamadas: ChamadaAoFornecedor[] = [];
  const falhas = () => new ErroDeIA("indisponivel", "HTTP 503", true);
  const erro = await erroDe(chamarComCredencial(credencial(), pedido(), {
    repositorio: repo,
    adaptadores: adaptadorRoteiro([falhas(), falhas(), falhas()], chamadas),
    esperar: () => Promise.resolve(),
  }));
  assertEquals(erro.codigo, "indisponivel");
  assertEquals(chamadas.length, 1 + ESPERAS_ENTRE_TENTATIVAS.length);
  assertEquals(repo.erros, [["cred-1", "indisponivel"]]);
});

Deno.test("falha da credencial não tenta de novo, fica registrada e pede o suporte (Q3)", async () => {
  const repo = new RepositorioFalso({}, null);
  const chamadas: ChamadaAoFornecedor[] = [];
  const erro = await erroDe(chamarComCredencial(credencial(), pedido(), {
    repositorio: repo,
    adaptadores: adaptadorRoteiro([new ErroDeIA("sem_saldo", "HTTP 429")], chamadas),
    esperar: () => Promise.resolve(),
  }));
  assertEquals([erro.codigo, chamadas.length], ["sem_saldo", 1]);
  assertEquals(repo.erros, [["cred-1", "sem_saldo"]]);
  assert(erro.mensagemAoUsuario.includes("Entre em contato com o suporte"));

  // Semente do ambiente não tem linha: nada a registrar.
  const repo2 = new RepositorioFalso({}, null);
  await erroDe(chamarComCredencial(credencial({ credencialId: null, escopo: "semente" }), pedido(), {
    repositorio: repo2,
    adaptadores: adaptadorRoteiro([new ErroDeIA("chave_invalida", "HTTP 401")], []),
  }));
  assertEquals(repo2.erros, []);
});

Deno.test("erro de programação do adaptador sobe sem nova tentativa nem registro", async () => {
  const repo = new RepositorioFalso({}, null);
  const chamadas: ChamadaAoFornecedor[] = [];
  await assertRejects(
    () => chamarComCredencial(credencial(), pedido(), { repositorio: repo, adaptadores: adaptadorRoteiro([new TypeError("pedido ruim")], chamadas) }),
    TypeError,
  );
  assertEquals([chamadas.length, repo.erros.length], [1, 0]);
});
