// Testes da medição e da entrada da camada (backlog IA-11). Banco e
// fornecedor simulados; a cifra é a real.
//
//   deno test --allow-read supabase/functions/_shared/ai/

import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { type ChavesMestras, cifrarChave } from "../ai-crypto.ts";
import { type DependenciasDaCamada, gerar } from "./camada.ts";
import type { LinhaDeCredencial, RepositorioDeCredenciais } from "./credencial.ts";
import { type ErroDoFornecedor, ErroDeIA } from "./erros.ts";
import { AcessoNegadoAIA, type ConsultaDeSituacao, lerSituacao } from "./guardas.ts";
import { custoEstimado, type EventoDeUso, type PrecoDeModelo, USO_ZERADO } from "./medicao.ts";
import type { Adaptador, ContextoDeIA, Fornecedor, PedidoDeIA } from "./tipos.ts";

const ORG = "a7000000-0000-4000-8000-000000000001";
const CONTEXTO: ContextoDeIA = { organizacaoId: ORG, usuarioId: "u1" };
const SEGREDO = "SEGREDO-DO-PROMPT-9f3a";
const CHAVE = "sk-chave-padrao-0123456789";
const MESTRAS: ChavesMestras = {
  versaoAtual: 1,
  porVersao: new Map([[1, btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))]]),
};

// ─── Custo ───────────────────────────────────────────────────────────

Deno.test("custo estimado em reais por 1M de tokens, com preço próprio do cache ou o da entrada", () => {
  const preco: PrecoDeModelo = { entrada: 10, saida: 40, entradaCache: 1, escritaCache: null };
  // 1M entrada × 10 + 0,5M saída × 40 + 2M cache × 1 + 0,1M escrita × 10 (sem preço próprio)
  assertEquals(custoEstimado({ entrada: 1_000_000, saida: 500_000, entradaCache: 2_000_000, escritaCache: 100_000 }, preco), 33);
  assertEquals(custoEstimado({ entrada: 123, saida: 45, entradaCache: 0, escritaCache: 0 }, preco), 0.00303);
  assertEquals(custoEstimado(USO_ZERADO, preco), 0);
  assertEquals(custoEstimado({ entrada: 1000, saida: 10, entradaCache: 0, escritaCache: 0 }, null), null);
});

// ─── Camada ──────────────────────────────────────────────────────────

function situacao(extra: Record<string, unknown> = {}) {
  return lerSituacao({ bloqueio: null, requisicoes_minuto_org: 0, requisicoes_minuto_usuario: 0, alerta_pct: 80, gasto_mes_brl: 0, ...extra });
}

interface Cenario {
  deps: DependenciasDaCamada;
  eventos: EventoDeUso[];
  errosDaCredencial: [string, ErroDoFornecedor | null][];
  chamadas: number;
}

async function cenario(opcoes: {
  situacao?: ReturnType<typeof situacao> | Error;
  padrao?: boolean;
  falhas?: ErroDeIA[];
  preco?: PrecoDeModelo | null;
  registroQuebra?: boolean;
} = {}): Promise<Cenario> {
  const c = await cifrarChave(CHAVE, null, MESTRAS);
  const linha: LinhaDeCredencial = {
    id: "cred-padrao",
    organization_id: null,
    provider: "gemini",
    key_ciphertext: c.ciphertext,
    key_iv: c.iv,
    key_version: c.version,
    model_rapido: "g-rapido",
    model_padrao: "g-padrao",
    model_visao: "g-visao",
    last_error: null,
  };
  const out: Cenario = { deps: undefined as unknown as DependenciasDaCamada, eventos: [], errosDaCredencial: [], chamadas: 0 };
  const credenciais: RepositorioDeCredenciais = {
    ativaDaOrganizacao: () => Promise.resolve(null),
    padraoAtiva: () => Promise.resolve(opcoes.padrao === false ? null : linha),
    registrarErro: (id, codigo) => {
      out.errosDaCredencial.push([id, codigo]);
      return Promise.resolve();
    },
  };
  const consulta: ConsultaDeSituacao = {
    situacao: () => opcoes.situacao instanceof Error ? Promise.reject(opcoes.situacao) : Promise.resolve(opcoes.situacao ?? situacao()),
  };
  const falhas = [...(opcoes.falhas ?? [])];
  const adaptador: Adaptador = (chamada) => {
    out.chamadas++;
    assertEquals(chamada.chave, CHAVE);
    const falha = falhas.shift();
    if (falha) return Promise.reject(falha);
    return Promise.resolve({
      texto: `resposta sobre ${SEGREDO}`,
      chamadas: [],
      fimPor: "fim" as const,
      fornecedor: chamada.fornecedor,
      modelo: chamada.modelo,
      uso: { entrada: 1000, saida: 200, entradaCache: 0, escritaCache: 0 },
    });
  };
  let relogio = 1_000;
  out.deps = {
    credenciais,
    situacao: consulta,
    registro: {
      registrar: (e) => {
        if (opcoes.registroQuebra) return Promise.reject(new Error("banco fora"));
        out.eventos.push(e);
        return Promise.resolve();
      },
    },
    precos: { vigente: () => Promise.resolve(opcoes.preco === undefined ? { entrada: 5, saida: 20, entradaCache: null, escritaCache: null } : opcoes.preco) },
    adaptadores: { openai: adaptador, gemini: adaptador, anthropic: adaptador } as Record<Fornecedor, Adaptador>,
    esperar: () => Promise.resolve(),
    chavesMestras: () => MESTRAS,
    lerAmbiente: () => undefined,
    agora: () => (relogio += 250),
  };
  return out;
}

function pedido(extra: Partial<PedidoDeIA> = {}): PedidoDeIA {
  return {
    funcionalidade: "sponsor-executive-summary",
    nivel: "padrao",
    sistema: `Sistema com ${SEGREDO}`,
    mensagens: [{ papel: "usuario", conteudo: `Pergunta com ${SEGREDO}` }],
    maxTokens: 1024,
    ...extra,
  };
}

Deno.test("sucesso: responde e registra uso, custo e latência — sem prompt, resposta nem chave no evento", async () => {
  const c = await cenario();
  const r = await gerar(CONTEXTO, pedido(), c.deps);
  assert(r.texto.includes(SEGREDO));
  assertEquals(c.eventos.length, 1);
  assertEquals(c.eventos[0], {
    organization_id: ORG,
    user_id: "u1",
    feature: "sponsor-executive-summary",
    tier: "padrao",
    provider: "gemini",
    model: "g-padrao",
    credential_id: "cred-padrao",
    credential_scope: "padrao",
    input_tokens: 1000,
    output_tokens: 200,
    cached_input_tokens: 0,
    cache_write_input_tokens: 0,
    estimated_cost_brl: 0.009, // 1000 × 5/1M + 200 × 20/1M
    latency_ms: 250,
    status: "sucesso",
    error_code: null,
  });
  const serializado = JSON.stringify(c.eventos);
  assert(!serializado.includes(SEGREDO) && !serializado.includes(CHAVE));
});

Deno.test("sem preço cadastrado: custo nulo, tokens registrados", async () => {
  const c = await cenario({ preco: null });
  await gerar(CONTEXTO, pedido(), c.deps);
  assertEquals([c.eventos[0].estimated_cost_brl, c.eventos[0].input_tokens], [null, 1000]);
});

Deno.test("pedido com imagem é medido no nível visao", async () => {
  const c = await cenario();
  await gerar(CONTEXTO, pedido({ nivel: "visao", mensagens: [{ papel: "usuario", conteudo: [{ tipo: "imagem", dataUrl: "data:image/png;base64,AAAA" }] }] }), c.deps);
  assertEquals([c.eventos[0].tier, c.eventos[0].model], ["visao", "g-visao"]);
});

Deno.test("erro do fornecedor: registra o erro com o código, sem tokens nem custo, e devolve o erro", async () => {
  const c = await cenario({ falhas: [new ErroDeIA("sem_saldo", "HTTP 429")] });
  const erro = (await assertRejects(() => gerar(CONTEXTO, pedido(), c.deps), ErroDeIA)) as ErroDeIA;
  assertEquals(erro.codigo, "sem_saldo");
  assertEquals(c.eventos.length, 1);
  const e = c.eventos[0];
  assertEquals([e.status, e.error_code, e.input_tokens, e.estimated_cost_brl, e.provider], ["erro", "sem_saldo", 0, null, "gemini"]);
  assertEquals(c.errosDaCredencial, [["cred-padrao", "sem_saldo"]]);
});

Deno.test("bloqueio da guarda: não chama o fornecedor e registra a tentativa como bloqueada", async () => {
  const c = await cenario({ situacao: situacao({ bloqueio: "orcamento_esgotado" }) });
  const erro = (await assertRejects(() => gerar(CONTEXTO, pedido(), c.deps), ErroDeIA)) as ErroDeIA;
  assertEquals(erro.codigo, "orcamento_esgotado");
  assertEquals(c.chamadas, 0);
  assertEquals([c.eventos.length, c.eventos[0].status, c.eventos[0].error_code, c.eventos[0].provider], [1, "bloqueado", "orcamento_esgotado", "gemini"]);
  // Bloqueio não é falha da credencial.
  assertEquals(c.errosDaCredencial, []);

  // Bloqueada e sem nenhuma chave configurada: devolve o bloqueio, sem evento.
  const semChave = await cenario({ situacao: situacao({ bloqueio: "ia_desabilitada" }), padrao: false });
  assertEquals(((await assertRejects(() => gerar(CONTEXTO, pedido(), semChave.deps), ErroDeIA)) as ErroDeIA).codigo, "ia_desabilitada");
  assertEquals(semChave.eventos, []);
});

Deno.test("não membro e falta de credencial sobem sem chamar o fornecedor nem registrar uso", async () => {
  const naoMembro = await cenario({ situacao: new AcessoNegadoAIA() });
  await assertRejects(() => gerar(CONTEXTO, pedido(), naoMembro.deps), AcessoNegadoAIA);
  assertEquals([naoMembro.chamadas, naoMembro.eventos.length], [0, 0]);

  const semChave = await cenario({ padrao: false });
  assertEquals(((await assertRejects(() => gerar(CONTEXTO, pedido(), semChave.deps), ErroDeIA)) as ErroDeIA).codigo, "indisponivel");
  assertEquals([semChave.chamadas, semChave.eventos.length], [0, 0]);
});

Deno.test("falha ao gravar a medição não derruba a resposta", async () => {
  const c = await cenario({ registroQuebra: true });
  const r = await gerar(CONTEXTO, pedido(), c.deps);
  assert(r.texto.length > 0);
});

Deno.test("pedido incoerente falha antes de qualquer consulta", async () => {
  const c = await cenario();
  await assertRejects(() => gerar(CONTEXTO, pedido({ maxTokens: 0 }), c.deps), TypeError);
  assertEquals([c.chamadas, c.eventos.length], [0, 0]);
});
