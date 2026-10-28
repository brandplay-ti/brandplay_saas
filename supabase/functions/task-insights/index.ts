// Copiloto para concluir uma tarefa (IA-16): tarefa do CRM, atividade de
// oportunidade ou item de checklist de propriedade. A organização é a do
// registro, lido sob RLS; as consultas ficam nela. Dados do patrocinador só
// com acesso ao CRM, financeiros só com acesso ao financeiro.

import { gerar } from "../_shared/ai/camada.ts";
import {
  autenticar,
  CORS,
  dependenciasDaCamada,
  ErroDaRequisicao,
  exigirModulo,
  json,
  respostaDeFalha,
  uuidDoCorpo,
} from "../_shared/ai/funcao.ts";
import type { EsquemaJson } from "../_shared/ai/tipos.ts";

const FUNCIONALIDADE = "task-insights";

/** Linha do PostgREST (as funções não têm os tipos gerados do banco). */
type Linha = Record<string, unknown>;

interface TarefaNormalizada {
  id: string;
  organization_id: string;
  sponsor_id: string | null;
  opportunity_id: string | null;
  title: string;
  description: string | null;
  task_type: string | null;
  priority: string | null;
  status: string | null;
  due_date: string | null;
  source: string | null;
}

const lista = (valor: unknown, max: number) => (Array.isArray(valor) ? valor.slice(0, max) : []);
const texto = (valor: unknown) => (typeof valor === "string" ? valor : "");

const ESQUEMA: EsquemaJson = {
  type: "object",
  properties: {
    resumo: { type: "string" },
    contexto_relevante: { type: "array", items: { type: "string" } },
    passos: {
      type: "array",
      items: {
        type: "object",
        properties: { titulo: { type: "string" }, detalhe: { type: "string" } },
        required: ["titulo", "detalhe"],
      },
    },
    argumentos: { type: "array", items: { type: "string" } },
    riscos: { type: "array", items: { type: "string" } },
    mensagem_sugerida: { type: "string" },
    dados_ausentes: { type: "array", items: { type: "string" } },
  },
  required: ["resumo", "contexto_relevante", "passos", "argumentos", "riscos", "mensagem_sugerida", "dados_ausentes"],
};

type Cliente = Awaited<ReturnType<typeof autenticar>>["cliente"];

async function patrocinadorDaOportunidade(cliente: Cliente, opportunityId: string | null): Promise<string | null> {
  if (!opportunityId) return null;
  const { data } = await cliente.from("opportunities").select("sponsor_id").eq("id", opportunityId).maybeSingle();
  return data?.sponsor_id ?? null;
}

async function lerTarefa(cliente: Cliente, source: string, taskId: string): Promise<TarefaNormalizada | null> {
  if (source === "activity") {
    const { data: a } = await cliente
      .from("opportunity_activities")
      .select("id,organization_id,opportunity_id,title,description,activity_type,status,due_date,completed_at")
      .eq("id", taskId)
      .maybeSingle();
    if (!a) return null;
    return {
      id: a.id,
      organization_id: a.organization_id,
      sponsor_id: await patrocinadorDaOportunidade(cliente, a.opportunity_id),
      opportunity_id: a.opportunity_id,
      title: a.title,
      description: a.description,
      task_type: a.activity_type,
      priority: null,
      status: a.completed_at ? "concluida" : a.status,
      due_date: a.due_date,
      source: "atividade_da_oportunidade",
    };
  }
  if (source === "checklist") {
    const { data: c } = await cliente
      .from("property_checklist_items")
      .select("id,organization_id,opportunity_id,sponsor_id,title,description,status,due_date,property_id")
      .eq("id", taskId)
      .maybeSingle();
    if (!c) return null;
    return {
      id: c.id,
      organization_id: c.organization_id,
      sponsor_id: c.sponsor_id ?? await patrocinadorDaOportunidade(cliente, c.opportunity_id),
      opportunity_id: c.opportunity_id,
      title: c.title,
      description: c.description,
      task_type: "checklist_operacional",
      priority: null,
      status: c.status,
      due_date: c.due_date,
      source: "checklist_da_propriedade",
    };
  }
  const { data: t } = await cliente
    .from("crm_tasks")
    .select("id,organization_id,sponsor_id,opportunity_id,title,description,task_type,priority,status,due_date,source")
    .eq("id", taskId)
    .maybeSingle();
  return (t as TarefaNormalizada | null) ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { usuario, cliente } = await autenticar(req);
    const corpo = await req.json().catch(() => ({}));
    const taskId = uuidDoCorpo(corpo, "task_id");
    const source = corpo?.source === "activity" || corpo?.source === "checklist" ? corpo.source : "crm_task";

    const task = await lerTarefa(cliente, source, taskId);
    if (!task?.organization_id) throw new ErroDaRequisicao(404, "Tarefa não encontrada");
    const org = task.organization_id;

    // Só a equipe da organização; o módulo é o da origem da tarefa.
    await exigirModulo(cliente, usuario.id, org, source === "checklist" ? "operacional" : "crm");
    const [crmR, financeiroR] = await Promise.all([
      cliente.rpc("can_access_module", { _user_id: usuario.id, _org_id: org, _module: "crm", _write: false }),
      cliente.rpc("can_access_module", { _user_id: usuario.id, _org_id: org, _module: "financeiro", _write: false }),
    ]);
    const canFinance = financeiroR.data === true;
    const sponsorId = crmR.data === true ? task.sponsor_id : null;

    const vazio = Promise.resolve({ data: [] as Linha[] });
    const [sponsorR, oppR, contactsR, oppsR, proposalsR, contractsR, interactionsR, tasksR, docsR] = await Promise.all([
      sponsorId
        ? cliente.from("sponsors").select("name,trade_name,segment,lifecycle,priority,health,notes,tags,last_contact_at,next_action,next_action_at").eq("id", sponsorId).eq("organization_id", org).maybeSingle()
        : Promise.resolve({ data: null }),
      task.opportunity_id
        ? cliente.from("opportunities").select("id,brand,stage,value,probability,expected_close_date,next_action,next_action_at,notes,loss_reason,sports_properties(name)").eq("id", task.opportunity_id).eq("organization_id", org).maybeSingle()
        : Promise.resolve({ data: null }),
      sponsorId ? cliente.from("sponsor_contacts").select("name,role,is_primary").eq("sponsor_id", sponsorId).eq("organization_id", org).limit(10) : vazio,
      sponsorId ? cliente.from("opportunities").select("brand,stage,value,expected_close_date,next_action").eq("sponsor_id", sponsorId).eq("organization_id", org).order("created_at", { ascending: false }).limit(10) : vazio,
      sponsorId ? cliente.from("proposals").select("title,status,total_value,sent_at,valid_until").eq("sponsor_id", sponsorId).eq("organization_id", org).order("created_at", { ascending: false }).limit(6) : vazio,
      sponsorId ? cliente.from("contracts").select("id,title,status,total_value,start_date,end_date").eq("sponsor_id", sponsorId).eq("organization_id", org).order("created_at", { ascending: false }).limit(6) : vazio,
      sponsorId ? cliente.from("sponsor_interactions").select("type,title,occurred_at").eq("sponsor_id", sponsorId).eq("organization_id", org).order("occurred_at", { ascending: false }).limit(10) : vazio,
      sponsorId ? cliente.from("crm_tasks").select("title,status,due_date,priority").eq("sponsor_id", sponsorId).eq("organization_id", org).eq("status", "aberta").limit(10) : vazio,
      sponsorId ? cliente.from("sponsor_documents").select("title,category,journey_stage,description").eq("sponsor_id", sponsorId).eq("organization_id", org).eq("ai_enabled", true).limit(15) : vazio,
    ]);

    const sponsor = (sponsorR.data ?? null) as Linha | null;
    const opportunity = (oppR.data ?? null) as Linha | null;
    const contracts: Linha[] = contractsR.data ?? [];
    const contractIds = contracts.map((c) => c.id);

    const deliveries: Linha[] = contractIds.length
      ? (await cliente.from("deliveries").select("title,status,approval,due_date").in("contract_id", contractIds).eq("organization_id", org).limit(40)).data ?? []
      : [];
    const installments: Linha[] = canFinance && contractIds.length
      ? (await cliente.from("installments").select("amount,status,due_date").in("contract_id", contractIds).eq("organization_id", org)).data ?? []
      : [];

    const today = new Date();
    const daysSince = (d?: unknown) => (typeof d === "string" && d ? Math.floor((today.getTime() - new Date(d).getTime()) / 86400000) : null);

    const ctx = {
      tarefa: {
        titulo: task.title,
        detalhes: task.description,
        tipo: task.task_type,
        prioridade: task.priority,
        status: task.status,
        prazo: task.due_date,
        dias_para_prazo: task.due_date ? -1 * (daysSince(task.due_date) ?? 0) : null,
        origem: task.source,
      },
      conta: sponsor && {
        nome: sponsor.trade_name || sponsor.name,
        segmento: sponsor.segment,
        ciclo_de_vida: sponsor.lifecycle,
        prioridade: sponsor.priority,
        saude: sponsor.health,
        dias_sem_contato: daysSince(sponsor.last_contact_at),
        proxima_acao: sponsor.next_action,
        observacoes: sponsor.notes,
        tags: sponsor.tags,
      },
      contatos: (contactsR.data ?? []).map((c: Linha) => ({ nome: c.name, cargo: c.role, principal: c.is_primary })),
      oportunidade_da_tarefa: opportunity && {
        marca: opportunity.brand,
        propriedade: (opportunity.sports_properties as { name?: string } | null)?.name ?? null,
        etapa: opportunity.stage,
        valor: opportunity.value,
        probabilidade: opportunity.probability,
        previsao_fechamento: opportunity.expected_close_date,
        proxima_acao: opportunity.next_action,
        observacoes: opportunity.notes,
      },
      outras_oportunidades: (oppsR.data ?? []).map((o: Linha) => ({ marca: o.brand, etapa: o.stage, valor: o.value, previsao: o.expected_close_date })),
      propostas: (proposalsR.data ?? []).map((p: Linha) => ({ titulo: p.title, status: p.status, valor: p.total_value, enviada_em: p.sent_at, valida_ate: p.valid_until })),
      contratos: contracts.map((c) => ({ titulo: c.title, status: c.status, inicio: c.start_date, fim: c.end_date })),
      entregas: {
        total: deliveries.length,
        atrasadas: deliveries.filter((d) => d.status === "atrasada").length,
        pendentes: deliveries.filter((d) => d.status === "pendente" || d.status === "em_producao").length,
        aprovadas: deliveries.filter((d) => d.approval === "aprovada").length,
      },
      financeiro: canFinance
        ? {
          total_contratado: contracts.reduce((s, c) => s + Number(c.total_value || 0), 0),
          parcelas_atrasadas: installments.filter((i) => i.status === "atrasado").length,
          proxima_parcela: installments.filter((i) => i.status === "pendente").map((i) => i.due_date).filter(Boolean).sort()[0] ?? null,
        }
        : null,
      outras_tarefas_abertas: (tasksR.data ?? []).map((t: Linha) => ({ titulo: t.title, prazo: t.due_date, prioridade: t.priority })),
      documentos_da_conta: (docsR.data ?? []).map((d: Linha) => ({ titulo: d.title, categoria: d.category, etapa: d.journey_stage, resumo: d.description })),
      ultimas_interacoes: (interactionsR.data ?? []).map((i: Linha) => `${String(i.occurred_at ?? "").slice(0, 10)} · ${i.type}: ${i.title}`),
    };

    const resposta = await gerar({ organizacaoId: org, usuarioId: usuario.id }, {
      funcionalidade: FUNCIONALIDADE,
      nivel: "padrao",
      sistema:
        "Você é um copiloto comercial de patrocínio esportivo em português do Brasil. Sua missão é ajudar o usuário a CONCLUIR a tarefa indicada. Use APENAS os dados fornecidos; nunca invente números, nomes ou fatos — o que faltar vai em dados_ausentes. Máximo 5 itens por lista, passos objetivos e acionáveis. A mensagem_sugerida deve ser curta (até 900 caracteres), pronta para enviar por e-mail/WhatsApp ao contato principal.",
      mensagens: [{ papel: "usuario", conteudo: `Contexto real no Brandplay:\n${JSON.stringify(ctx, null, 2)}` }],
      json: { nome: "insights_da_tarefa", esquema: ESQUEMA },
      maxTokens: 4096,
    }, dependenciasDaCamada());
    const insights = resposta.json ?? {};

    return json({
      generated_at: new Date().toISOString(),
      task_title: task.title,
      sponsor_name: sponsor ? sponsor.trade_name || sponsor.name : null,
      opportunity_label: opportunity?.brand ?? null,
      finance_included: canFinance,
      insights: {
        resumo: texto(insights.resumo),
        contexto_relevante: lista(insights.contexto_relevante, 5),
        passos: lista(insights.passos, 5),
        argumentos: lista(insights.argumentos, 5),
        riscos: lista(insights.riscos, 5),
        mensagem_sugerida: texto(insights.mensagem_sugerida),
        dados_ausentes: lista(insights.dados_ausentes, 5),
      },
      facts: {
        dias_sem_contato: ctx.conta?.dias_sem_contato ?? null,
        entregas: ctx.entregas,
        financeiro: ctx.financeiro,
      },
    });
  } catch (e) {
    return respostaDeFalha(e, FUNCIONALIDADE);
  }
});
