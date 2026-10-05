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
    const sponsorId = typeof body?.sponsor_id === "string" ? body.sponsor_id : null;
    const objective = typeof body?.objective === "string" ? body.objective.slice(0, 300) : "";
    if (!sponsorId) return json({ error: "sponsor_id obrigatório" }, 400);

    // Conta (RLS já bloqueia contas de outra organização)
    const { data: sponsor } = await supabase
      .from("sponsors")
      .select("id,organization_id,name,trade_name,segment,website,domain,tags,notes,lifecycle,priority,health,last_contact_at,next_action,next_action_at,archived_at")
      .eq("id", sponsorId)
      .maybeSingle();
    if (!sponsor) return json({ error: "Conta não encontrada" }, 404);

    // Restrição de acesso: apenas membros internos da organização (usuários do
    // Portal do Patrocinador não podem gerar briefing interno).
    const { data: isMember } = await supabase.rpc("is_org_member", {
      _user_id: user.id,
      _org_id: sponsor.organization_id,
    });
    if (!isMember) return json({ error: "Acesso restrito à equipe da organização" }, 403);

    const { data: canCrm } = await supabase.rpc("can_access_module", {
      _user_id: user.id,
      _org_id: sponsor.organization_id,
      _module: "crm",
      _write: false,
    });
    if (!canCrm) return json({ error: "Sem permissão no módulo CRM" }, 403);

    const { data: canFinance } = await supabase.rpc("can_access_module", {
      _user_id: user.id,
      _org_id: sponsor.organization_id,
      _module: "financeiro",
      _write: false,
    });

    const [contactsR, oppsR, propsR, contractsR, interactionsR, tasksR, brandsR, docsR] = await Promise.all([
      supabase.from("sponsor_contacts").select("name,role,email,phone,is_primary").eq("sponsor_id", sponsorId),
      supabase.from("opportunities").select("id,brand,stage,value,expected_close_date,next_action,loss_reason").eq("sponsor_id", sponsorId).order("created_at", { ascending: false }).limit(20),
      supabase.from("proposals").select("title,status,total_value,sent_at,valid_until").eq("sponsor_id", sponsorId).order("created_at", { ascending: false }).limit(10),
      supabase.from("contracts").select("id,title,status,total_value,start_date,end_date").eq("sponsor_id", sponsorId).order("created_at", { ascending: false }).limit(10),
      supabase.from("sponsor_interactions").select("type,title,description,occurred_at").eq("sponsor_id", sponsorId).order("occurred_at", { ascending: false }).limit(12),
      supabase.from("crm_tasks").select("title,task_type,status,due_date,priority").eq("sponsor_id", sponsorId).eq("status", "aberta").order("due_date", { ascending: true }).limit(10),
      supabase.from("sponsor_brands").select("name,category,is_active").eq("sponsor_id", sponsorId).limit(20),
      supabase.from("sponsor_documents").select("title,category,journey_stage,description,created_at").eq("sponsor_id", sponsorId).eq("ai_enabled", true).order("created_at", { ascending: false }).limit(20),
    ]);


    const contracts = contractsR.data ?? [];
    const contractIds = contracts.map((c: any) => c.id);

    const deliveries = contractIds.length
      ? (await supabase
          .from("deliveries")
          .select("title,status,approval,due_date,delivered_at")
          .in("contract_id", contractIds)
          .order("due_date", { ascending: true })
          .limit(30)).data ?? []
      : [];

    // Dados financeiros só entram no contexto se o usuário tiver acesso ao módulo.
    const installments = canFinance && contractIds.length
      ? (await supabase
          .from("installments")
          .select("amount,status,due_date,paid_at")
          .in("contract_id", contractIds)).data ?? []
      : [];

    const today = new Date();
    const daysSince = (d?: string | null) =>
      d ? Math.floor((today.getTime() - new Date(d).getTime()) / 86400000) : null;

    const openOpps = (oppsR.data ?? []).filter((o: any) => o.stage !== "fechado" && o.stage !== "perdido");
    const activeContracts = contracts.filter((c: any) => c.status === "ativo" || c.status === "vencendo");
    const nextExpiry = activeContracts
      .map((c: any) => c.end_date)
      .filter(Boolean)
      .sort()[0] ?? null;

    const overdueDeliveries = deliveries.filter((d: any) => d.status === "atrasada").length;
    const pendingDeliveries = deliveries.filter((d: any) => d.status === "pendente" || d.status === "em_producao").length;
    const approvedDeliveries = deliveries.filter((d: any) => d.approval === "aprovada").length;

    const finance = canFinance
      ? {
          total_contratado: contracts.reduce((s: number, c: any) => s + Number(c.total_value || 0), 0),
          total_pago: installments.filter((i: any) => i.status === "pago").reduce((s: number, i: any) => s + Number(i.amount || 0), 0),
          parcelas_atrasadas: installments.filter((i: any) => i.status === "atrasado").length,
          proxima_parcela: installments
            .filter((i: any) => i.status === "pendente")
            .map((i: any) => i.due_date)
            .filter(Boolean)
            .sort()[0] ?? null,
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
      contatos: (contactsR.data ?? []).map((c: any) => ({ nome: c.name, cargo: c.role, principal: c.is_primary })),
      marcas: (brandsR.data ?? []).map((b: any) => ({ nome: b.name, categoria: b.category, ativa: b.is_active })),
      oportunidades_abertas: openOpps.map((o: any) => ({ marca: o.brand, etapa: o.stage, valor: o.value, previsao: o.expected_close_date, proxima_acao: o.next_action })),
      oportunidades_perdidas: (oppsR.data ?? []).filter((o: any) => o.stage === "perdido").map((o: any) => ({ marca: o.brand, motivo: o.loss_reason })),
      propostas: (propsR.data ?? []).map((p: any) => ({ titulo: p.title, status: p.status, valor: p.total_value, enviada_em: p.sent_at, valida_ate: p.valid_until })),
      contratos: contracts.map((c: any) => ({ titulo: c.title, status: c.status, inicio: c.start_date, fim: c.end_date })),
      proxima_expiracao_contrato: nextExpiry,
      entregas: { aprovadas: approvedDeliveries, pendentes: pendingDeliveries, atrasadas: overdueDeliveries, total: deliveries.length },
      financeiro: finance,
      financeiro_disponivel: Boolean(canFinance),
      tarefas_abertas: (tasksR.data ?? []).map((t: any) => ({ titulo: t.title, prazo: t.due_date, prioridade: t.priority })),
      documentos_anexados: (docsR.data ?? []).map((d: any) => ({
        titulo: d.title, categoria: d.category, etapa: d.journey_stage,
        resumo: d.description, enviado_em: (d.created_at ?? "").slice(0, 10),
      })),
      ultimas_interacoes: (interactionsR.data ?? []).map((i: any) => `${(i.occurred_at ?? "").slice(0, 10)} · ${i.type}: ${i.title}`),
    };


    const schema = {
      type: "object",
      properties: {
        resumo: { type: "string" },
        agenda: {
          type: "array",
          items: {
            type: "object",
            properties: {
              titulo: { type: "string" },
              minutos: { type: "number" },
              objetivo: { type: "string" },
            },
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
            properties: {
              titulo: { type: "string" },
              prazo_em_dias: { type: "number" },
              prioridade: { type: "string" },
            },
            required: ["titulo", "prazo_em_dias", "prioridade"],
          },
        },
        dados_ausentes: { type: "array", items: { type: "string" } },
      },
      required: ["resumo", "agenda", "pontos_fortes", "riscos", "perguntas", "proximos_passos", "dados_ausentes"],
    };

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Você prepara reuniões comerciais de patrocínio esportivo em português do Brasil. Use APENAS os dados fornecidos: nunca invente números, nomes ou fatos. Quando faltar informação relevante, liste em dados_ausentes. Agenda com 4 a 6 blocos somando no máximo 45 minutos. Máximo 5 itens por lista.",
          },
          { role: "user", content: `Prepare a reunião com base nestes dados reais da conta:\n${JSON.stringify(ctx, null, 2)}` },
        ],
        response_format: { type: "json_schema", json_schema: { name: "meeting_prep", strict: true, schema } },
      }),
    });

    if (aiResp.status === 429) return json({ error: "Limite de requisições de IA. Tente novamente em instantes." }, 429);
    if (aiResp.status === 402) return json({ error: "Créditos de IA esgotados. Adicione créditos na sua workspace." }, 402);
    if (!aiResp.ok) {
      console.error("AI error", await aiResp.text());
      return json({ error: "Falha ao gerar a preparação da reunião" }, 502);
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
      sponsor_name: sponsor.trade_name || sponsor.name,
      finance_included: Boolean(canFinance),
      briefing: {
        resumo: parsed.resumo ?? "",
        agenda: Array.isArray(parsed.agenda) ? parsed.agenda.slice(0, 6) : [],
        pontos_fortes: (parsed.pontos_fortes ?? []).slice(0, 5),
        riscos: (parsed.riscos ?? []).slice(0, 5),
        perguntas: (parsed.perguntas ?? []).slice(0, 5),
        proximos_passos: (parsed.proximos_passos ?? []).slice(0, 5),
        dados_ausentes: (parsed.dados_ausentes ?? []).slice(0, 5),
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
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, 500);
  }
});
