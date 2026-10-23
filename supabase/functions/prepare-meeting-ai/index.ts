// Preparação de reunião com um patrocinador (IA-16). A organização é a do
// patrocinador, lido sob RLS; as consultas ficam nela. Dados financeiros só
// entram no contexto para quem tem acesso ao módulo financeiro.

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

const FUNCIONALIDADE = "prepare-meeting-ai";

/** Linha do PostgREST (as funções não têm os tipos gerados do banco). */
type Linha = Record<string, unknown>;

const lista = (valor: unknown, max: number) => (Array.isArray(valor) ? valor.slice(0, max) : []);

const ESQUEMA: EsquemaJson = {
  type: "object",
  properties: {
    resumo: { type: "string" },
    agenda: {
      type: "array",
      items: {
        type: "object",
        properties: { titulo: { type: "string" }, minutos: { type: "number" }, objetivo: { type: "string" } },
        required: ["titulo", "minutos", "objetivo"],
      },
    },
    pontos_fortes: { type: "array", items: { type: "string" } },
    riscos: { type: "array", items: { type: "string" } },
    perguntas: { type: "array", items: { type: "string" } },
    proximos_passos: {
      type: "array",
      items: {
        type: "object",
        properties: { titulo: { type: "string" }, prazo_em_dias: { type: "number" }, prioridade: { type: "string" } },
        required: ["titulo", "prazo_em_dias", "prioridade"],
      },
    },
    dados_ausentes: { type: "array", items: { type: "string" } },
  },
  required: ["resumo", "agenda", "pontos_fortes", "riscos", "perguntas", "proximos_passos", "dados_ausentes"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { usuario, cliente } = await autenticar(req);
    const corpo = await req.json().catch(() => ({}));
    const sponsorId = uuidDoCorpo(corpo, "sponsor_id");
    const objective = typeof corpo?.objective === "string" ? corpo.objective.slice(0, 300) : "";

    const { data: sponsor } = await cliente
      .from("sponsors")
      .select("id,organization_id,name,trade_name,segment,website,domain,tags,notes,lifecycle,priority,health,last_contact_at,next_action,next_action_at,archived_at")
      .eq("id", sponsorId)
      .maybeSingle();
    if (!sponsor?.organization_id) throw new ErroDaRequisicao(404, "Conta não encontrada");
    const org: string = sponsor.organization_id;

    // Só a equipe da organização (o portal do patrocinador não gera briefing interno).
    await exigirModulo(cliente, usuario.id, org, "crm");
    const { data: canFinance } = await cliente.rpc("can_access_module", {
      _user_id: usuario.id,
      _org_id: org,
      _module: "financeiro",
      _write: false,
    });

    const [contactsR, oppsR, propsR, contractsR, interactionsR, tasksR, brandsR, docsR] = await Promise.all([
      cliente.from("sponsor_contacts").select("name,role,email,phone,is_primary").eq("sponsor_id", sponsorId).eq("organization_id", org),
      cliente.from("opportunities").select("id,brand,stage,value,expected_close_date,next_action,loss_reason").eq("sponsor_id", sponsorId).eq("organization_id", org).order("created_at", { ascending: false }).limit(20),
      cliente.from("proposals").select("title,status,total_value,sent_at,valid_until").eq("sponsor_id", sponsorId).eq("organization_id", org).order("created_at", { ascending: false }).limit(10),
      cliente.from("contracts").select("id,title,status,total_value,start_date,end_date").eq("sponsor_id", sponsorId).eq("organization_id", org).order("created_at", { ascending: false }).limit(10),
      cliente.from("sponsor_interactions").select("type,title,description,occurred_at").eq("sponsor_id", sponsorId).eq("organization_id", org).order("occurred_at", { ascending: false }).limit(12),
      cliente.from("crm_tasks").select("title,task_type,status,due_date,priority").eq("sponsor_id", sponsorId).eq("organization_id", org).eq("status", "aberta").order("due_date", { ascending: true }).limit(10),
      cliente.from("sponsor_brands").select("name,category,is_active").eq("sponsor_id", sponsorId).eq("organization_id", org).limit(20),
      cliente.from("sponsor_documents").select("title,category,journey_stage,description,created_at").eq("sponsor_id", sponsorId).eq("organization_id", org).eq("ai_enabled", true).order("created_at", { ascending: false }).limit(20),
    ]);

    const contracts: Linha[] = contractsR.data ?? [];
    const contractIds = contracts.map((c) => c.id);

    const deliveries: Linha[] = contractIds.length
      ? (await cliente
        .from("deliveries")
        .select("title,status,approval,due_date,delivered_at")
        .in("contract_id", contractIds)
        .eq("organization_id", org)
        .order("due_date", { ascending: true })
        .limit(30)).data ?? []
      : [];

    const installments: Linha[] = canFinance && contractIds.length
      ? (await cliente.from("installments").select("amount,status,due_date,paid_at").in("contract_id", contractIds).eq("organization_id", org)).data ?? []
      : [];

    const today = new Date();
    const daysSince = (d?: string | null) => d ? Math.floor((today.getTime() - new Date(d).getTime()) / 86400000) : null;

    const opps: Linha[] = oppsR.data ?? [];
    const openOpps = opps.filter((o) => o.stage !== "fechado" && o.stage !== "perdido");
    const activeContracts = contracts.filter((c) => c.status === "ativo" || c.status === "vencendo");
    const nextExpiry = activeContracts.map((c) => c.end_date).filter(Boolean).sort()[0] ?? null;

    const finance = canFinance
      ? {
        total_contratado: contracts.reduce((s, c) => s + Number(c.total_value || 0), 0),
        total_pago: installments.filter((i) => i.status === "pago").reduce((s, i) => s + Number(i.amount || 0), 0),
        parcelas_atrasadas: installments.filter((i) => i.status === "atrasado").length,
        proxima_parcela: installments.filter((i) => i.status === "pendente").map((i) => i.due_date).filter(Boolean).sort()[0] ?? null,
      }
      : null;

    const ctx = {
      conta: {
        nome: sponsor.trade_name || sponsor.name,
        segmento: sponsor.segment,
        ciclo_de_vida: sponsor.lifecycle,
        prioridade: sponsor.priority,
        saude: sponsor.health,
        dias_sem_contato: daysSince(sponsor.last_contact_at),
        proxima_acao: sponsor.next_action,
        proxima_acao_em: sponsor.next_action_at,
        observacoes: sponsor.notes,
        tags: sponsor.tags,
      },
      objetivo_da_reuniao: objective || null,
      contatos: (contactsR.data ?? []).map((c: Linha) => ({ nome: c.name, cargo: c.role, principal: c.is_primary })),
      marcas: (brandsR.data ?? []).map((b: Linha) => ({ nome: b.name, categoria: b.category, ativa: b.is_active })),
      oportunidades_abertas: openOpps.map((o) => ({ marca: o.brand, etapa: o.stage, valor: o.value, previsao: o.expected_close_date, proxima_acao: o.next_action })),
      oportunidades_perdidas: opps.filter((o) => o.stage === "perdido").map((o) => ({ marca: o.brand, motivo: o.loss_reason })),
      propostas: (propsR.data ?? []).map((p: Linha) => ({ titulo: p.title, status: p.status, valor: p.total_value, enviada_em: p.sent_at, valida_ate: p.valid_until })),
      contratos: contracts.map((c) => ({ titulo: c.title, status: c.status, inicio: c.start_date, fim: c.end_date })),
      proxima_expiracao_contrato: nextExpiry,
      entregas: {
        aprovadas: deliveries.filter((d) => d.approval === "aprovada").length,
        pendentes: deliveries.filter((d) => d.status === "pendente" || d.status === "em_producao").length,
        atrasadas: deliveries.filter((d) => d.status === "atrasada").length,
        total: deliveries.length,
      },
      financeiro: finance,
      financeiro_disponivel: Boolean(canFinance),
      tarefas_abertas: (tasksR.data ?? []).map((t: Linha) => ({ titulo: t.title, prazo: t.due_date, prioridade: t.priority })),
      documentos_anexados: (docsR.data ?? []).map((d: Linha) => ({
        titulo: d.title,
        categoria: d.category,
        etapa: d.journey_stage,
        resumo: d.description,
        enviado_em: String(d.created_at ?? "").slice(0, 10),
      })),
      ultimas_interacoes: (interactionsR.data ?? []).map((i: Linha) => `${String(i.occurred_at ?? "").slice(0, 10)} · ${i.type}: ${i.title}`),
    };

    const resposta = await gerar({ organizacaoId: org, usuarioId: usuario.id }, {
      funcionalidade: FUNCIONALIDADE,
      nivel: "padrao",
      sistema:
        "Você prepara reuniões comerciais de patrocínio esportivo em português do Brasil. Use APENAS os dados fornecidos: nunca invente números, nomes ou fatos. Quando faltar informação relevante, liste em dados_ausentes. Agenda com 4 a 6 blocos somando no máximo 45 minutos. Máximo 5 itens por lista.",
      mensagens: [{ papel: "usuario", conteudo: `Prepare a reunião com base nestes dados reais da conta:\n${JSON.stringify(ctx, null, 2)}` }],
      json: { nome: "preparacao_de_reuniao", esquema: ESQUEMA },
      maxTokens: 4096,
    }, dependenciasDaCamada());
    const briefing = resposta.json ?? {};

    return json({
      generated_at: new Date().toISOString(),
      sponsor_name: sponsor.trade_name || sponsor.name,
      finance_included: Boolean(canFinance),
      briefing: {
        resumo: typeof briefing.resumo === "string" ? briefing.resumo : "",
        agenda: lista(briefing.agenda, 6),
        pontos_fortes: lista(briefing.pontos_fortes, 5),
        riscos: lista(briefing.riscos, 5),
        perguntas: lista(briefing.perguntas, 5),
        proximos_passos: lista(briefing.proximos_passos, 5),
        dados_ausentes: lista(briefing.dados_ausentes, 5),
      },
      facts: {
        dias_sem_contato: ctx.conta.dias_sem_contato,
        oportunidades_abertas: openOpps.length,
        contratos_ativos: activeContracts.length,
        proxima_expiracao_contrato: nextExpiry,
        entregas: ctx.entregas,
        financeiro: finance,
      },
    });
  } catch (e) {
    return respostaDeFalha(e, FUNCIONALIDADE);
  }
});
