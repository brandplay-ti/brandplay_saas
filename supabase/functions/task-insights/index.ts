import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autorizado" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Não autorizado" }, 401);

    const body = await req.json().catch(() => ({}));
    const taskId = typeof body?.task_id === "string" ? body.task_id : null;
    const source: string = typeof body?.source === "string" ? body.source : "crm_task";
    if (!taskId) return json({ error: "task_id obrigatório" }, 400);

    type NormalizedTask = {
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
    };

    let task: NormalizedTask | null = null;

    if (source === "activity") {
      const { data: a } = await supabase
        .from("opportunity_activities")
        .select("id,organization_id,opportunity_id,title,description,activity_type,status,due_date,completed_at")
        .eq("id", taskId)
        .maybeSingle();
      if (a) {
        let sponsorId: string | null = null;
        if (a.opportunity_id) {
          const { data: opp } = await supabase
            .from("opportunities").select("sponsor_id").eq("id", a.opportunity_id).maybeSingle();
          sponsorId = opp?.sponsor_id ?? null;
        }
        task = {
          id: a.id,
          organization_id: a.organization_id as string,
          sponsor_id: sponsorId,
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
    } else if (source === "checklist") {
      const { data: c } = await supabase
        .from("property_checklist_items")
        .select("id,organization_id,opportunity_id,sponsor_id,title,description,status,due_date,property_id")
        .eq("id", taskId)
        .maybeSingle();
      if (c) {
        let sponsorId: string | null = c.sponsor_id ?? null;
        if (!sponsorId && c.opportunity_id) {
          const { data: opp } = await supabase
            .from("opportunities").select("sponsor_id").eq("id", c.opportunity_id).maybeSingle();
          sponsorId = opp?.sponsor_id ?? null;
        }
        task = {
          id: c.id,
          organization_id: c.organization_id as string,
          sponsor_id: sponsorId,
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
    } else {
      const { data: t } = await supabase
        .from("crm_tasks")
        .select("id,organization_id,sponsor_id,opportunity_id,title,description,task_type,priority,status,due_date,source")
        .eq("id", taskId)
        .maybeSingle();
      task = (t as NormalizedTask | null) ?? null;
    }

    if (!task || !task.organization_id) return json({ error: "Tarefa não encontrada" }, 404);


    const { data: isMember } = await supabase.rpc("is_org_member", {
      _user_id: user.id,
      _org_id: task.organization_id,
    });
    if (!isMember) return json({ error: "Acesso restrito à equipe da organização" }, 403);

    const { data: canCrm } = await supabase.rpc("can_access_module", {
      _user_id: user.id, _org_id: task.organization_id, _module: "crm", _write: false,
    });
    if (!canCrm && source === "crm_task") return json({ error: "Sem permissão no módulo CRM" }, 403);
    const sponsorAllowed = Boolean(canCrm);


    const { data: canFinance } = await supabase.rpc("can_access_module", {
      _user_id: user.id, _org_id: task.organization_id, _module: "financeiro", _write: false,
    });

    const sponsorId = sponsorAllowed ? task.sponsor_id : null;

    const [sponsorR, oppR, contactsR, oppsR, proposalsR, contractsR, interactionsR, tasksR, docsR] = await Promise.all([
      sponsorId ? supabase.from("sponsors").select("name,trade_name,segment,lifecycle,priority,health,notes,tags,last_contact_at,next_action,next_action_at").eq("id", sponsorId).maybeSingle() : Promise.resolve({ data: null }),
      task.opportunity_id ? supabase.from("opportunities").select("id,brand,stage,value,probability,expected_close_date,next_action,next_action_at,notes,loss_reason,sports_properties(name)").eq("id", task.opportunity_id).maybeSingle() : Promise.resolve({ data: null }),
      sponsorId ? supabase.from("sponsor_contacts").select("name,role,is_primary").eq("sponsor_id", sponsorId).limit(10) : Promise.resolve({ data: [] }),
      sponsorId ? supabase.from("opportunities").select("brand,stage,value,expected_close_date,next_action").eq("sponsor_id", sponsorId).order("created_at", { ascending: false }).limit(10) : Promise.resolve({ data: [] }),
      sponsorId ? supabase.from("proposals").select("title,status,total_value,sent_at,valid_until").eq("sponsor_id", sponsorId).order("created_at", { ascending: false }).limit(6) : Promise.resolve({ data: [] }),
      sponsorId ? supabase.from("contracts").select("id,title,status,total_value,start_date,end_date").eq("sponsor_id", sponsorId).order("created_at", { ascending: false }).limit(6) : Promise.resolve({ data: [] }),
      sponsorId ? supabase.from("sponsor_interactions").select("type,title,occurred_at").eq("sponsor_id", sponsorId).order("occurred_at", { ascending: false }).limit(10) : Promise.resolve({ data: [] }),
      sponsorId ? supabase.from("crm_tasks").select("title,status,due_date,priority").eq("sponsor_id", sponsorId).eq("status", "aberta").limit(10) : Promise.resolve({ data: [] }),
      sponsorId ? supabase.from("sponsor_documents").select("title,category,journey_stage,description").eq("sponsor_id", sponsorId).eq("ai_enabled", true).limit(15) : Promise.resolve({ data: [] }),
    ]);

    const sponsor: any = sponsorR?.data ?? null;
    const opportunity: any = oppR?.data ?? null;
    const contracts: any[] = contractsR?.data ?? [];
    const contractIds = contracts.map((c: any) => c.id);

    const deliveries = contractIds.length
      ? (await supabase.from("deliveries").select("title,status,approval,due_date").in("contract_id", contractIds).limit(40)).data ?? []
      : [];
    const installments = canFinance && contractIds.length
      ? (await supabase.from("installments").select("amount,status,due_date").in("contract_id", contractIds)).data ?? []
      : [];

    const today = new Date();
    const daysSince = (d?: string | null) => (d ? Math.floor((today.getTime() - new Date(d).getTime()) / 86400000) : null);

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
      contatos: (contactsR?.data ?? []).map((c: any) => ({ nome: c.name, cargo: c.role, principal: c.is_primary })),
      oportunidade_da_tarefa: opportunity && {
        marca: opportunity.brand,
        propriedade: opportunity.sports_properties?.name ?? null,
        etapa: opportunity.stage,
        valor: opportunity.value,
        probabilidade: opportunity.probability,
        previsao_fechamento: opportunity.expected_close_date,
        proxima_acao: opportunity.next_action,
        observacoes: opportunity.notes,
      },
      outras_oportunidades: (oppsR?.data ?? []).map((o: any) => ({ marca: o.brand, etapa: o.stage, valor: o.value, previsao: o.expected_close_date })),
      propostas: (proposalsR?.data ?? []).map((p: any) => ({ titulo: p.title, status: p.status, valor: p.total_value, enviada_em: p.sent_at, valida_ate: p.valid_until })),
      contratos: contracts.map((c: any) => ({ titulo: c.title, status: c.status, inicio: c.start_date, fim: c.end_date })),
      entregas: {
        total: deliveries.length,
        atrasadas: deliveries.filter((d: any) => d.status === "atrasada").length,
        pendentes: deliveries.filter((d: any) => d.status === "pendente" || d.status === "em_producao").length,
        aprovadas: deliveries.filter((d: any) => d.approval === "aprovada").length,
      },
      financeiro: canFinance
        ? {
            total_contratado: contracts.reduce((s: number, c: any) => s + Number(c.total_value || 0), 0),
            parcelas_atrasadas: installments.filter((i: any) => i.status === "atrasado").length,
            proxima_parcela: installments.filter((i: any) => i.status === "pendente").map((i: any) => i.due_date).filter(Boolean).sort()[0] ?? null,
          }
        : null,
      outras_tarefas_abertas: (tasksR?.data ?? []).map((t: any) => ({ titulo: t.title, prazo: t.due_date, prioridade: t.priority })),
      documentos_da_conta: (docsR?.data ?? []).map((d: any) => ({ titulo: d.title, categoria: d.category, etapa: d.journey_stage, resumo: d.description })),
      ultimas_interacoes: (interactionsR?.data ?? []).map((i: any) => `${(i.occurred_at ?? "").slice(0, 10)} · ${i.type}: ${i.title}`),
    };

    const schema = {
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

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Você é um copiloto comercial de patrocínio esportivo em português do Brasil. Sua missão é ajudar o usuário a CONCLUIR a tarefa indicada. Use APENAS os dados fornecidos; nunca invente números, nomes ou fatos — o que faltar vai em dados_ausentes. Máximo 5 itens por lista, passos objetivos e acionáveis. A mensagem_sugerida deve ser curta (até 900 caracteres), pronta para enviar por e-mail/WhatsApp ao contato principal.",
          },
          { role: "user", content: `Contexto real no BrandPlay:\n${JSON.stringify(ctx, null, 2)}` },
        ],
        response_format: { type: "json_schema", json_schema: { name: "task_insights", strict: true, schema } },
      }),
    });

    if (aiResp.status === 429) return json({ error: "Limite de requisições de IA. Tente novamente em instantes." }, 429);
    if (aiResp.status === 402) return json({ error: "Créditos de IA esgotados. Adicione créditos na sua workspace." }, 402);
    if (!aiResp.ok) {
      console.error("AI error", await aiResp.text());
      return json({ error: "Falha ao gerar insights da tarefa" }, 502);
    }

    const data = await aiResp.json();
    let parsed: any = {};
    try {
      parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
    } catch {
      return json({ error: "Resposta da IA inválida" }, 502);
    }

    return json({
      generated_at: new Date().toISOString(),
      task_title: task.title,
      sponsor_name: sponsor ? sponsor.trade_name || sponsor.name : null,
      opportunity_label: opportunity?.brand ?? null,
      finance_included: Boolean(canFinance),
      insights: {
        resumo: parsed.resumo ?? "",
        contexto_relevante: (parsed.contexto_relevante ?? []).slice(0, 5),
        passos: (parsed.passos ?? []).slice(0, 5),
        argumentos: (parsed.argumentos ?? []).slice(0, 5),
        riscos: (parsed.riscos ?? []).slice(0, 5),
        mensagem_sugerida: parsed.mensagem_sugerida ?? "",
        dados_ausentes: (parsed.dados_ausentes ?? []).slice(0, 5),
      },
      facts: {
        dias_sem_contato: ctx.conta?.dias_sem_contato ?? null,
        entregas: ctx.entregas,
        financeiro: ctx.financeiro,
      },
    });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, 500);
  }
});
