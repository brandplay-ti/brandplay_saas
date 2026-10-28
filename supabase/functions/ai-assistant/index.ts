// BrandAI, o assistente do CRM (IA-20): conversa com ferramentas que
// consultam e registram dados da organização.
//
// A organização é a da conversa (`ai_conversations`, lida sob RLS — só o
// dono a vê). Conversa nova nasce na organização ativa enviada pelo portal,
// validada contra o usuário do JWT. Toda ferramenta filtra por essa
// organização; antes, as consultas varriam todas as organizações do usuário
// e a conversa era criada sem `organization_id` (o RLS a recusava).
//
// O loop de ferramentas passa pela camada (`gerar`), e o histórico em
// `ai_messages` é gravado no formato neutro (`_shared/ai/historico.ts`),
// que também lê as conversas antigas, gravadas no formato da Anthropic.
//
// Nada é gravado antes da primeira resposta da IA: se a chamada é barrada
// (orçamento, IA desativada), a pergunta não fica órfã na conversa.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { gerar } from "../_shared/ai/camada.ts";
import {
  autenticar,
  CORS,
  dependenciasDaCamada,
  ErroDaRequisicao,
  exigirModulo,
  json,
  organizacaoDoCorpo,
  respostaDeFalha,
  uuidDoCorpo,
} from "../_shared/ai/funcao.ts";
import { chamadasParaGravar, type LinhaDoHistorico, mensagensDoHistorico } from "../_shared/ai/historico.ts";
import type { ChamadaDeFerramenta, Ferramenta, Mensagem, ResultadoDeFerramenta } from "../_shared/ai/tipos.ts";

const FUNCIONALIDADE = "ai-assistant";

/** Linha do PostgREST (as funções não têm os tipos gerados do banco). */
type Linha = Record<string, unknown>;

const MAX_RODADAS = 5;
const JANELA_DO_HISTORICO = 50;
const SEM_RESPOSTA = "Não consegui concluir a resposta. Tente reformular a pergunta.";

const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "search_sponsors",
    descricao:
      "Busca patrocinadores da organização. Filtros opcionais por nome, segmento, score (quente/morno/frio) ou dias sem contato.",
    parametros: {
      type: "object",
      properties: {
        query: { type: "string", description: "Texto livre (nome/segmento)" },
        score: { type: "string", enum: ["quente", "morno", "frio"] },
        days_without_contact: { type: "number" },
        limit: { type: "number", description: "Padrão 20, máximo 50" },
      },
    },
  },
  {
    nome: "search_opportunities",
    descricao: "Busca oportunidades do pipeline. Filtros por estágio, marca, valor mínimo.",
    parametros: {
      type: "object",
      properties: {
        stage: { type: "string", enum: ["prospect", "reuniao", "proposta_enviada", "negociacao", "fechado", "perdido"] },
        brand: { type: "string" },
        min_value: { type: "number" },
        limit: { type: "number", description: "Padrão 20, máximo 50" },
      },
    },
  },
  {
    nome: "search_contracts",
    descricao: "Busca contratos. Filtros por status, marca.",
    parametros: {
      type: "object",
      properties: {
        status: { type: "string" },
        brand: { type: "string" },
        limit: { type: "number", description: "Padrão 20, máximo 50" },
      },
    },
  },
  {
    nome: "get_overdue_installments",
    descricao: "Lista parcelas atrasadas ou com vencimento próximo.",
    parametros: {
      type: "object",
      properties: {
        days_ahead: { type: "number", description: "Dias à frente para incluir vencimentos próximos (padrão 7)" },
      },
    },
  },
  {
    nome: "get_pending_deliveries",
    descricao: "Lista entregas pendentes ou atrasadas.",
    parametros: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["pendente", "em_producao", "atrasada"] },
        limit: { type: "number", description: "Padrão 20, máximo 50" },
      },
    },
  },
  {
    nome: "get_dashboard_metrics",
    descricao:
      "Retorna métricas agregadas: total de patrocinadores, oportunidades por estágio, valor do pipeline, receita do mês, contratos ativos.",
    parametros: { type: "object", properties: {} },
  },
  {
    nome: "create_sponsor_interaction",
    descricao: "Registra uma interação manual com um patrocinador (reunião, ligação, e-mail, whatsapp, nota).",
    parametros: {
      type: "object",
      properties: {
        sponsor_id: { type: "string" },
        type: { type: "string", enum: ["reuniao", "ligacao", "email", "whatsapp", "nota"] },
        title: { type: "string" },
        description: { type: "string" },
        next_action: { type: "string" },
        next_action_at: { type: "string", description: "ISO date opcional" },
      },
      required: ["sponsor_id", "type", "title"],
    },
  },
  {
    nome: "create_opportunity_activity",
    descricao: "Cria uma tarefa/atividade em uma oportunidade.",
    parametros: {
      type: "object",
      properties: {
        opportunity_id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        due_date: { type: "string", description: "ISO date" },
        activity_type: { type: "string", enum: ["nota", "ligacao", "reuniao", "email", "tarefa"] },
      },
      required: ["opportunity_id", "title"],
    },
  },
];

const SISTEMA = `Você é o "BrandAI", assistente do CRM de patrocínio esportivo.
Você ajuda o usuário a entender seu pipeline, patrocinadores, contratos, entregas e finanças.

REGRAS:
- Seja direto, conciso e profissional. Responda em português do Brasil.
- SEMPRE use as ferramentas disponíveis para consultar dados reais — nunca invente números, nomes ou status.
- Quando pedirem para "listar", "mostrar", "quantos", "quais", chame a ferramenta apropriada.
- Para ações (criar tarefa, registrar interação), confirme os parâmetros essenciais antes de executar se houver ambiguidade. Se o usuário foi explícito, execute direto.
- Formate respostas com markdown: use listas, **negrito** para destaques e tabelas quando útil.
- Valores em R$ usar formato BRL: R$ 1.234,56.
- Quando relevante, ofereça próximos passos sugeridos ao final.`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const limite = (valor: unknown, padrao = 20) => Math.max(1, Math.min(50, Math.round(Number(valor) || padrao)));
const texto = (valor: unknown, max = 2000) => (typeof valor === "string" && valor.trim() ? valor.slice(0, max) : null);
/** Texto livre que vai dentro de um filtro do PostgREST: sem os caracteres que mudam o filtro. */
const termo = (valor: unknown) => (typeof valor === "string" ? valor.replace(/[,()*%\\:"']/g, " ").trim().slice(0, 100) : "");
const dataISO = (d: Date) => d.toISOString().slice(0, 10);

class FalhaDaFerramenta extends Error {}

function conferir<T>(r: { data: T; error: { code?: string } | null }): T {
  if (r.error) {
    throw new FalhaDaFerramenta(r.error.code === "42501" ? "Sem permissão para esta ação nesta organização." : "Não foi possível consultar os dados.");
  }
  return r.data;
}

/** Executa uma ferramenta na organização da conversa, sob o RLS do usuário. */
async function executar(cliente: SupabaseClient, org: string, usuarioId: string, chamada: ChamadaDeFerramenta): Promise<unknown> {
  const args = chamada.argumentos;
  switch (chamada.nome) {
    case "search_sponsors": {
      let q = cliente
        .from("sponsors")
        .select("id, name, segment, score, last_contact_at, tags, website")
        .eq("organization_id", org)
        .order("updated_at", { ascending: false })
        .limit(limite(args.limit));
      const busca = termo(args.query);
      if (busca) q = q.or(`name.ilike.%${busca}%,segment.ilike.%${busca}%`);
      if (["quente", "morno", "frio"].includes(String(args.score))) q = q.eq("score", String(args.score));
      if (Number(args.days_without_contact) > 0) {
        const corte = new Date();
        corte.setDate(corte.getDate() - Math.min(3650, Number(args.days_without_contact)));
        q = q.or(`last_contact_at.lt.${dataISO(corte)},last_contact_at.is.null`);
      }
      const itens = conferir(await q) ?? [];
      return { count: itens.length, items: itens };
    }
    case "search_opportunities": {
      let q = cliente
        .from("opportunities")
        .select("id, brand, value, stage, expected_close_date, sponsor_id, last_stage_change_at")
        .eq("organization_id", org)
        .order("updated_at", { ascending: false })
        .limit(limite(args.limit));
      if (typeof args.stage === "string") q = q.eq("stage", args.stage);
      if (termo(args.brand)) q = q.ilike("brand", `%${termo(args.brand)}%`);
      if (Number(args.min_value) > 0) q = q.gte("value", Number(args.min_value));
      const itens = conferir(await q) ?? [];
      return { count: itens.length, items: itens };
    }
    case "search_contracts": {
      let q = cliente
        .from("contracts")
        .select("id, title, brand, status, total_value, start_date, end_date, sponsor_id")
        .eq("organization_id", org)
        .order("updated_at", { ascending: false })
        .limit(limite(args.limit));
      if (typeof args.status === "string" && args.status) q = q.eq("status", args.status);
      if (termo(args.brand)) q = q.ilike("brand", `%${termo(args.brand)}%`);
      const itens = conferir(await q) ?? [];
      return { count: itens.length, items: itens };
    }
    case "get_overdue_installments": {
      const ate = new Date();
      ate.setDate(ate.getDate() + Math.max(0, Math.min(90, Math.round(Number(args.days_ahead) || 7))));
      const itens = conferir(
        await cliente
          .from("installments")
          .select("id, contract_id, installment_number, total_installments, amount, due_date, status")
          .eq("organization_id", org)
          .or(`status.eq.atrasado,and(status.eq.pendente,due_date.lte.${dataISO(ate)})`)
          .order("due_date", { ascending: true })
          .limit(50),
      ) ?? [];
      return { count: itens.length, items: itens };
    }
    case "get_pending_deliveries": {
      let q = cliente
        .from("deliveries")
        .select("id, title, brand, status, approval, due_date, quantity")
        .eq("organization_id", org)
        .order("due_date", { ascending: true })
        .limit(limite(args.limit));
      const status = ["pendente", "em_producao", "atrasada"].includes(String(args.status)) ? String(args.status) : null;
      q = status ? q.eq("status", status) : q.in("status", ["pendente", "em_producao", "atrasada"]);
      const itens = conferir(await q) ?? [];
      return { count: itens.length, items: itens };
    }
    case "get_dashboard_metrics": {
      const inicioDoMes = dataISO(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
      const [sponsorsR, oppsR, contractsR, installmentsR] = await Promise.all([
        cliente.from("sponsors").select("id, score", { count: "exact" }).eq("organization_id", org),
        cliente.from("opportunities").select("stage, value").eq("organization_id", org),
        cliente.from("contracts").select("status, total_value").eq("organization_id", org),
        cliente.from("installments").select("amount, status, paid_at").eq("organization_id", org).gte("paid_at", inicioDoMes),
      ]);
      const sponsors: Linha[] = conferir(sponsorsR) ?? [];
      const opps: Linha[] = conferir(oppsR) ?? [];
      const contracts: Linha[] = conferir(contractsR) ?? [];
      const installments: Linha[] = conferir(installmentsR) ?? [];

      const porEstagio: Record<string, { count: number; value: number }> = {};
      for (const o of opps) {
        const e = porEstagio[String(o.stage)] ??= { count: 0, value: 0 };
        e.count++;
        e.value += Number(o.value || 0);
      }
      const porScore: Record<string, number> = {};
      for (const s of sponsors) porScore[String(s.score)] = (porScore[String(s.score)] ?? 0) + 1;
      const ativos = contracts.filter((c) => c.status === "ativo");
      return {
        total_sponsors: sponsorsR.count ?? sponsors.length,
        sponsors_by_score: porScore,
        pipeline_by_stage: porEstagio,
        total_pipeline_value: opps.reduce((s, o) => s + Number(o.value || 0), 0),
        active_contracts_count: ativos.length,
        active_contracts_value: ativos.reduce((s, c) => s + Number(c.total_value || 0), 0),
        month_revenue_paid: installments.filter((i) => i.status === "pago").reduce((s, i) => s + Number(i.amount || 0), 0),
      };
    }
    case "create_sponsor_interaction": {
      const sponsorId = String(args.sponsor_id ?? "");
      const tipo = String(args.type ?? "");
      const titulo = texto(args.title, 200);
      if (!UUID.test(sponsorId) || !titulo || !["reuniao", "ligacao", "email", "whatsapp", "nota"].includes(tipo)) {
        return { error: "Parâmetros inválidos: informe sponsor_id, type e title." };
      }
      // O patrocinador precisa ser da organização da conversa.
      const sponsor = conferir(await cliente.from("sponsors").select("id").eq("id", sponsorId).eq("organization_id", org).maybeSingle());
      if (!sponsor) return { error: "Patrocinador não encontrado nesta organização." };
      conferir(
        await cliente.from("sponsor_interactions").insert({
          sponsor_id: sponsorId,
          organization_id: org,
          owner_id: usuarioId,
          type: tipo,
          title: titulo,
          description: texto(args.description),
          next_action: texto(args.next_action, 500),
          next_action_at: texto(args.next_action_at, 40),
          source: "manual",
        }),
      );
      return { success: true, message: "Interação registrada." };
    }
    case "create_opportunity_activity": {
      const oppId = String(args.opportunity_id ?? "");
      const titulo = texto(args.title, 200);
      if (!UUID.test(oppId) || !titulo) return { error: "Parâmetros inválidos: informe opportunity_id e title." };
      const opp = conferir(await cliente.from("opportunities").select("id").eq("id", oppId).eq("organization_id", org).maybeSingle());
      if (!opp) return { error: "Oportunidade não encontrada nesta organização." };
      const tipo = ["nota", "ligacao", "reuniao", "email", "tarefa"].includes(String(args.activity_type)) ? String(args.activity_type) : "tarefa";
      conferir(
        await cliente.from("opportunity_activities").insert({
          opportunity_id: oppId,
          organization_id: org,
          owner_id: usuarioId,
          title: titulo,
          description: texto(args.description),
          due_date: texto(args.due_date, 40),
          activity_type: tipo,
          status: "pendente",
        }),
      );
      return { success: true, message: "Atividade criada." };
    }
    default:
      return { error: `Ferramenta desconhecida: ${chamada.nome}` };
  }
}

async function resultadoDaFerramenta(
  cliente: SupabaseClient,
  org: string,
  usuarioId: string,
  chamada: ChamadaDeFerramenta,
): Promise<ResultadoDeFerramenta> {
  let resultado: unknown;
  try {
    resultado = await executar(cliente, org, usuarioId, chamada);
  } catch (e) {
    // O modelo recebe a falha para explicar ao usuário; o log fica só com o nome da ferramenta.
    if (!(e instanceof FalhaDaFerramenta)) console.error(`${FUNCIONALIDADE}: ferramenta ${chamada.nome} falhou`);
    resultado = { error: e instanceof FalhaDaFerramenta ? e.message : "Não foi possível executar a ferramenta." };
  }
  return { idChamada: chamada.id, nome: chamada.nome, conteudo: JSON.stringify(resultado) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { usuario, cliente } = await autenticar(req);
    const corpo = await req.json().catch(() => ({}));
    const pergunta = typeof corpo?.message === "string" ? corpo.message.trim().slice(0, 4000) : "";
    if (!pergunta) throw new ErroDaRequisicao(400, "message obrigatório");

    let conversaId: string | null = null;
    let org: string;
    let historico: Mensagem[] = [];
    if (corpo?.conversationId) {
      conversaId = uuidDoCorpo(corpo, "conversationId");
      const { data: conversa } = await cliente
        .from("ai_conversations")
        .select("id, organization_id")
        .eq("id", conversaId)
        .maybeSingle();
      if (!conversa?.organization_id) throw new ErroDaRequisicao(404, "Conversa não encontrada");
      org = conversa.organization_id;
      await exigirModulo(cliente, usuario.id, org, "crm");

      // As últimas mensagens, em ordem cronológica.
      const { data: linhas } = await cliente
        .from("ai_messages")
        .select("role, content, tool_calls, tool_call_id, tool_name")
        .eq("conversation_id", conversaId)
        .order("created_at", { ascending: false })
        .limit(JANELA_DO_HISTORICO);
      historico = mensagensDoHistorico(((linhas ?? []) as LinhaDoHistorico[]).reverse());
    } else {
      org = organizacaoDoCorpo(corpo);
      await exigirModulo(cliente, usuario.id, org, "crm");
    }

    const garantirConversa = async (): Promise<string> => {
      if (conversaId) return conversaId;
      const { data, error } = await cliente
        .from("ai_conversations")
        .insert({ user_id: usuario.id, organization_id: org, title: pergunta.slice(0, 60) })
        .select("id")
        .single();
      if (error || !data) throw new Error(`ai_conversations: criação falhou (${error?.code ?? "?"})`);
      conversaId = data.id as string;
      return conversaId;
    };
    const gravar = async (linha: Linha) => {
      const { error } = await cliente.from("ai_messages").insert({ conversation_id: await garantirConversa(), ...linha });
      if (error) console.error(`${FUNCIONALIDADE}: mensagem não gravada (${error.code ?? "?"})`);
    };

    const mensagens: Mensagem[] = [...historico, { papel: "usuario", conteudo: pergunta }];
    const deps = dependenciasDaCamada();
    let perguntaGravada = false;
    let final = "";

    for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
      const resposta = await gerar({ organizacaoId: org, usuarioId: usuario.id }, {
        funcionalidade: FUNCIONALIDADE,
        nivel: "padrao",
        sistema: SISTEMA,
        mensagens,
        ferramentas: FERRAMENTAS,
        maxTokens: 4096,
      }, deps);

      if (!perguntaGravada) {
        await gravar({ role: "user", content: pergunta });
        perguntaGravada = true;
      }

      // Última rodada ainda pedindo ferramentas: não executa (ninguém leria o
      // resultado — e podem ser escritas) e encerra sem resposta.
      if (resposta.chamadas.length === 0 || rodada === MAX_RODADAS - 1) {
        final = resposta.chamadas.length === 0 ? resposta.texto.trim() || SEM_RESPOSTA : SEM_RESPOSTA;
        await gravar({ role: "assistant", content: final });
        break;
      }

      await gravar({ role: "assistant", content: resposta.texto, tool_calls: chamadasParaGravar(resposta.chamadas) });
      mensagens.push({ papel: "assistente", texto: resposta.texto, chamadas: resposta.chamadas });

      // Uma ferramenta por vez: as de escrita não podem correr juntas.
      const resultados: ResultadoDeFerramenta[] = [];
      for (const chamada of resposta.chamadas) {
        const r = await resultadoDaFerramenta(cliente, org, usuario.id, chamada);
        await gravar({ role: "tool", content: r.conteudo, tool_call_id: r.idChamada, tool_name: r.nome });
        resultados.push(r);
      }
      mensagens.push({ papel: "resultados", resultados });
    }

    const { error: erroData } = await cliente
      .from("ai_conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", await garantirConversa());
    if (erroData) console.error(`${FUNCIONALIDADE}: last_message_at não atualizado (${erroData.code ?? "?"})`);

    return json({ conversationId: conversaId, content: final });
  } catch (e) {
    return respostaDeFalha(e, FUNCIONALIDADE);
  }
});
