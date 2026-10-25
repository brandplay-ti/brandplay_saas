// Testes do conversor do histórico do assistente (backlog IA-20). Sem rede
// nem banco.
//
//   deno test --allow-read supabase/functions/_shared/ai/

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { chamadasGravadas, chamadasParaGravar, type LinhaDoHistorico, mensagensDoHistorico } from "./historico.ts";
import { validarPedido } from "./tipos.ts";

function linha(role: string, content: string | null, extra: Partial<LinhaDoHistorico> = {}): LinhaDoHistorico {
  return { role, content, tool_calls: null, tool_call_id: null, tool_name: null, ...extra };
}

const pergunta = linha("user", "Quais patrocinadores estão quentes?");
const resposta = linha("assistant", "São 2: **A** e **B**.");

Deno.test("formato neutro: grava e lê de volta igual, com a assinatura do fornecedor", () => {
  const chamadas = chamadasParaGravar([
    { id: "call-1", nome: "search_sponsors", argumentos: { score: "quente" }, assinatura: "sig==" },
  ]);
  // Nada além dos campos neutros vai para a coluna.
  assertEquals(JSON.parse(JSON.stringify(chamadas)), [{ id: "call-1", nome: "search_sponsors", argumentos: { score: "quente" }, assinatura: "sig==" }]);

  const historico = mensagensDoHistorico([
    pergunta,
    linha("assistant", "", { tool_calls: chamadas }),
    linha("tool", '{"count":2}', { tool_call_id: "call-1", tool_name: "search_sponsors" }),
    resposta,
  ]);
  assertEquals(historico, [
    { papel: "usuario", conteudo: "Quais patrocinadores estão quentes?" },
    { papel: "assistente", chamadas: [{ id: "call-1", nome: "search_sponsors", argumentos: { score: "quente" }, assinatura: "sig==" }] },
    { papel: "resultados", resultados: [{ idChamada: "call-1", nome: "search_sponsors", conteudo: '{"count":2}' }] },
    { papel: "assistente", texto: "São 2: **A** e **B**." },
  ]);
});

Deno.test("formato Anthropic antigo: blocos tool_use viram chamadas, text é ignorado (o texto está em content)", () => {
  const blocos = [
    { type: "text", text: "Vou consultar." },
    { type: "tool_use", id: "toolu_01", name: "search_sponsors", input: { score: "quente" } },
    { type: "tool_use", id: "toolu_02", name: "get_dashboard_metrics", input: {} },
  ];
  const historico = mensagensDoHistorico([
    pergunta,
    linha("assistant", "Vou consultar.", { tool_calls: blocos }),
    linha("tool", '{"count":2}', { tool_call_id: "toolu_01", tool_name: "search_sponsors" }),
    linha("tool", '{"total_sponsors":9}', { tool_call_id: "toolu_02", tool_name: "get_dashboard_metrics" }),
    resposta,
  ]);
  assertEquals(historico[1], {
    papel: "assistente",
    texto: "Vou consultar.",
    chamadas: [
      { id: "toolu_01", nome: "search_sponsors", argumentos: { score: "quente" } },
      { id: "toolu_02", nome: "get_dashboard_metrics", argumentos: {} },
    ],
  });
  // Resultados paralelos do mesmo turno ficam juntos, na ordem das chamadas.
  assertEquals(historico[2], {
    papel: "resultados",
    resultados: [
      { idChamada: "toolu_01", nome: "search_sponsors", conteudo: '{"count":2}' },
      { idChamada: "toolu_02", nome: "get_dashboard_metrics", conteudo: '{"total_sponsors":9}' },
    ],
  });
  assertEquals(historico.length, 4);
});

Deno.test("formato OpenAI do Lovable: function.arguments em texto vira objeto; nome do resultado vem da chamada", () => {
  const historico = mensagensDoHistorico([
    pergunta,
    linha("assistant", null, {
      tool_calls: [{ id: "call_abc", type: "function", function: { name: "search_contracts", arguments: '{"status":"ativo"}' } }],
    }),
    linha("tool", "[]", { tool_call_id: "call_abc", tool_name: null }),
    resposta,
  ]);
  assertEquals(historico[1], { papel: "assistente", chamadas: [{ id: "call_abc", nome: "search_contracts", argumentos: { status: "ativo" } }] });
  assertEquals(historico[2], { papel: "resultados", resultados: [{ idChamada: "call_abc", nome: "search_contracts", conteudo: "[]" }] });

  // Argumento que não é JSON não derruba a conversa.
  assertEquals(chamadasGravadas([{ id: "x", type: "function", function: { name: "f", arguments: "{quebrado" } }]), [
    { id: "x", nome: "f", argumentos: {} },
  ]);
});

Deno.test("janela que começa no meio do turno e execução interrompida não geram histórico inválido", () => {
  const historico = mensagensDoHistorico([
    // Janela cortada: resultado e resposta de um turno cuja pergunta ficou de fora.
    linha("tool", '{"count":1}', { tool_call_id: "antiga", tool_name: "search_sponsors" }),
    linha("assistant", "Resposta antiga."),
    pergunta,
    // Execução interrompida: chamada gravada, resultado não.
    linha("assistant", "", { tool_calls: [{ id: "perdida", nome: "get_pending_deliveries", argumentos: {} }] }),
    linha("user", "E as entregas?"),
    // Resultado de uma chamada que não está na mensagem anterior.
    linha("assistant", "Consultando.", { tool_calls: [{ id: "c1", nome: "get_pending_deliveries", argumentos: {} }] }),
    linha("tool", "[]", { tool_call_id: "c1", tool_name: "get_pending_deliveries" }),
    linha("tool", "[]", { tool_call_id: "intrusa", tool_name: "search_sponsors" }),
    linha("system", "ignorado"),
    linha("user", "   "),
  ]);
  assertEquals(historico, [
    { papel: "usuario", conteudo: "Quais patrocinadores estão quentes?" },
    { papel: "usuario", conteudo: "E as entregas?" },
    { papel: "assistente", texto: "Consultando.", chamadas: [{ id: "c1", nome: "get_pending_deliveries", argumentos: {} }] },
    { papel: "resultados", resultados: [{ idChamada: "c1", nome: "get_pending_deliveries", conteudo: "[]" }] },
  ]);

  // O resultado passa na validação da camada (com a nova pergunta no fim).
  validarPedido({
    funcionalidade: "teste",
    nivel: "padrao",
    mensagens: [...historico, { papel: "usuario", conteudo: "Obrigado" }],
    maxTokens: 100,
  });
});

Deno.test("histórico sem pergunta do usuário fica vazio", () => {
  assertEquals(mensagensDoHistorico([]), []);
  assertEquals(mensagensDoHistorico([linha("assistant", "Olá!"), linha("system", "x")]), []);
});
