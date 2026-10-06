// Suggest next steps using the Anthropic API for multiple contexts:
// opportunity | sponsor | contract | dashboard | delivery | proposal
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Você é um coach comercial sênior em patrocínio esportivo. Receba um contexto e sugira 3 a 5 próximos passos PRÁTICOS, específicos e acionáveis em português do Brasil.
Use SEMPRE a tool "next_steps".
Cada passo:
- title: ação curta no imperativo (máx 60 chars)
- description: 1-2 frases sobre por que e como
- activity_type: um de "ligacao" | "email" | "reuniao" | "tarefa" | "nota"
- priority: "alta" | "media" | "baixa"
- due_in_days: int 0-30`;

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysSince = (d: string | null) =>
  d ? Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000) : null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const uid = userData.user.id;

    const body = await req.json();
    const context: string = body.context ?? (body.opportunity_id ? "opportunity" : "");
    const targetId: string | undefined = body.target_id ?? body.opportunity_id;

    let ctx = "";

    if (context === "opportunity") {
      if (!targetId) throw new Error("target_id obrigatório");
      const { data: opp } = await supabase
        .from("opportunities")
        .select("id, brand, value, stage, expected_close_date, last_stage_change_at, notes, sponsor_id, property_id")
        .eq("id", targetId).maybeSingle();
      if (!opp) throw new Error("Oportunidade não encontrada");

      const [{ data: sponsor }, { data: property }, { data: activities }] = await Promise.all([
        opp.sponsor_id
          ? supabase.from("sponsors").select("name, segment, score, last_contact_at").eq("id", opp.sponsor_id).maybeSingle()
          : Promise.resolve({ data: null }),
        opp.property_id
          ? supabase.from("sports_properties").select("name, category").eq("id", opp.property_id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from("opportunity_activities")
          .select("activity_type, title, status, due_date, completed_at, created_at")
          .eq("opportunity_id", targetId)
          .order("created_at", { ascending: false }).limit(10),
      ]);

      ctx = [
        `CONTEXTO: Oportunidade comercial`,
        `Marca: ${opp.brand} | Estágio: ${opp.stage} (há ${daysSince(opp.last_stage_change_at) ?? 0} dias) | Valor: R$ ${opp.value}`,
        opp.expected_close_date ? `Fechamento esperado: ${opp.expected_close_date}` : null,
        opp.notes ? `Notas: ${opp.notes}` : null,
        sponsor ? `Patrocinador: ${sponsor.name}${sponsor.segment ? ` (${sponsor.segment})` : ""} | Score: ${sponsor.score}${sponsor.last_contact_at ? ` | Último contato: ${sponsor.last_contact_at}` : ""}` : null,
        property ? `Propriedade: ${property.name} (${property.category})` : null,
        activities?.length
          ? `Atividades recentes:\n${activities.map((a: any) => `- [${a.status}] ${a.activity_type}: ${a.title}${a.due_date ? ` (vence ${a.due_date})` : ""}`).join("\n")}`
          : `Nenhuma atividade registrada.`,
      ].filter(Boolean).join("\n");
    }

    else if (context === "sponsor") {
      if (!targetId) throw new Error("target_id obrigatório");
      const { data: sp } = await supabase
        .from("sponsors")
        .select("id, name, segment, score, tags, last_contact_at, notes")
        .eq("id", targetId).maybeSingle();
      if (!sp) throw new Error("Patrocinador não encontrado");

      const [{ data: contracts }, { data: opps }, { data: contacts }] = await Promise.all([
        supabase.from("contracts")
          .select("title, status, total_value, end_date").eq("sponsor_id", targetId)
          .order("created_at", { ascending: false }).limit(5),
        supabase.from("opportunities")
          .select("brand, stage, value, last_stage_change_at").eq("sponsor_id", targetId)
          .order("last_stage_change_at", { ascending: false }).limit(5),
        supabase.from("sponsor_contacts")
          .select("name, role, is_primary").eq("sponsor_id", targetId).limit(5),
      ]);

      ctx = [
        `CONTEXTO: Reativação/relacionamento de patrocinador`,
        `Patrocinador: ${sp.name}${sp.segment ? ` (${sp.segment})` : ""} | Score: ${sp.score}`,
        sp.last_contact_at ? `Último contato: ${sp.last_contact_at} (há ${daysSince(sp.last_contact_at)} dias)` : `Sem registro de último contato.`,
        sp.tags?.length ? `Tags: ${sp.tags.join(", ")}` : null,
        sp.notes ? `Notas: ${sp.notes}` : null,
        contacts?.length
          ? `Contatos: ${contacts.map((c: any) => `${c.name}${c.role ? ` (${c.role})` : ""}${c.is_primary ? " [principal]" : ""}`).join("; ")}`
          : `Nenhum contato cadastrado.`,
        contracts?.length
          ? `Contratos:\n${contracts.map((c: any) => `- ${c.title} | ${c.status} | R$ ${c.total_value}${c.end_date ? ` | fim ${c.end_date}` : ""}`).join("\n")}`
          : `Nenhum contrato registrado.`,
        opps?.length
          ? `Oportunidades:\n${opps.map((o: any) => `- ${o.brand} | ${o.stage} | R$ ${o.value}`).join("\n")}`
          : `Nenhuma oportunidade aberta.`,
      ].filter(Boolean).join("\n");
    }

    else if (context === "contract") {
      if (!targetId) throw new Error("target_id obrigatório");
      const { data: c } = await supabase
        .from("contracts")
        .select("id, title, brand, status, total_value, start_date, end_date, payment_method, installments, sponsor_id, notes")
        .eq("id", targetId).maybeSingle();
      if (!c) throw new Error("Contrato não encontrado");

      const [{ data: ins }, { data: del }, { data: clauses }] = await Promise.all([
        supabase.from("installments")
          .select("installment_number, due_date, amount, status, paid_at").eq("contract_id", targetId)
          .order("due_date").limit(10),
        supabase.from("deliveries")
          .select("title, status, due_date, approval").or(`opportunity_id.eq.${c.id},brand.eq.${c.brand}`)
          .limit(10),
        supabase.from("contract_clauses")
          .select("title").eq("contract_id", targetId).limit(10),
      ]);

      const today = todayISO();
      const overdue = (ins ?? []).filter((i: any) => i.status === "atrasado" || (i.status === "pendente" && i.due_date < today));
      const nextDue = (ins ?? []).find((i: any) => i.status === "pendente" && i.due_date >= today);
      const lateDel = (del ?? []).filter((d: any) => d.due_date && d.due_date < today && d.status !== "entregue" && d.status !== "aprovada");

      ctx = [
        `CONTEXTO: Gestão de ciclo de vida de contrato`,
        `Contrato: ${c.title} | Marca: ${c.brand} | Status: ${c.status}`,
        `Valor: R$ ${c.total_value} | Pagamento: ${c.payment_method} | Parcelas: ${c.installments}`,
        c.start_date ? `Vigência: ${c.start_date} → ${c.end_date ?? "indefinido"}` : null,
        c.end_date ? `Dias até fim: ${Math.ceil((new Date(c.end_date).getTime() - Date.now()) / 86_400_000)}` : null,
        c.notes ? `Notas: ${c.notes}` : null,
        overdue.length ? `Parcelas em atraso: ${overdue.length}` : `Nenhuma parcela atrasada.`,
        nextDue ? `Próxima parcela: #${nextDue.installment_number} R$ ${nextDue.amount} em ${nextDue.due_date}` : null,
        lateDel.length ? `Entregas atrasadas (${lateDel.length}):\n${lateDel.map((d: any) => `- ${d.title} (vencia ${d.due_date})`).join("\n")}` : `Entregas em dia.`,
        clauses?.length ? `Cláusulas registradas: ${clauses.length}` : `Sem cláusulas estruturadas.`,
      ].filter(Boolean).join("\n");
    }

    else if (context === "dashboard") {
      // Aggregate the most urgent items across the entire workspace
      const today = todayISO();
      const stalledLimit = new Date(); stalledLimit.setDate(stalledLimit.getDate() - 7);
      const expiringLimit = new Date(); expiringLimit.setDate(expiringLimit.getDate() + 30);

      const [{ data: stalledOpps }, { data: expiring }, { data: pendingProposals }, { data: lateDeliveries }, { data: overdueIns }] = await Promise.all([
        supabase.from("opportunities")
          .select("brand, stage, value, last_stage_change_at")
          .eq("owner_id", uid)
          .not("stage", "in", "(fechado,perdido)")
          .lt("last_stage_change_at", stalledLimit.toISOString())
          .order("last_stage_change_at").limit(5),
        supabase.from("contracts")
          .select("title, brand, end_date, status")
          .eq("owner_id", uid).in("status", ["ativo", "vencendo"])
          .gte("end_date", today).lte("end_date", expiringLimit.toISOString().slice(0, 10))
          .order("end_date").limit(5),
        supabase.from("proposals")
          .select("title, brand, status, sent_at, total_value")
          .eq("owner_id", uid).eq("status", "enviada")
          .order("sent_at").limit(5),
        supabase.from("deliveries")
          .select("title, brand, due_date, status")
          .eq("owner_id", uid).neq("status", "entregue").neq("status", "aprovada")
          .lt("due_date", today).order("due_date").limit(5),
        supabase.from("installments")
          .select("amount, due_date, status").eq("owner_id", uid).eq("status", "atrasado")
          .order("due_date").limit(10),
      ]);

      ctx = [
        `CONTEXTO: Painel de ações prioritárias do dia. Sugira passos cobrindo os itens mais urgentes abaixo.`,
        stalledOpps?.length
          ? `Oportunidades paradas há +7 dias:\n${stalledOpps.map((o: any) => `- ${o.brand} (${o.stage}) parada há ${daysSince(o.last_stage_change_at)}d, R$ ${o.value}`).join("\n")}`
          : `Sem oportunidades paradas.`,
        expiring?.length
          ? `Contratos vencendo em 30d:\n${expiring.map((c: any) => `- ${c.title} (${c.brand}) fim ${c.end_date}`).join("\n")}`
          : `Nenhum contrato perto do fim.`,
        pendingProposals?.length
          ? `Propostas enviadas sem resposta:\n${pendingProposals.map((p: any) => `- ${p.title}${p.brand ? ` (${p.brand})` : ""}${p.sent_at ? ` enviada ${p.sent_at.slice(0, 10)}` : ""} R$ ${p.total_value}`).join("\n")}`
          : `Sem propostas pendentes de resposta.`,
        lateDeliveries?.length
          ? `Entregas atrasadas:\n${lateDeliveries.map((d: any) => `- ${d.title} (${d.brand}) vencia ${d.due_date}`).join("\n")}`
          : `Entregas em dia.`,
        overdueIns?.length
          ? `Parcelas atrasadas: ${overdueIns.length} (total R$ ${overdueIns.reduce((s: number, i: any) => s + Number(i.amount), 0)})`
          : `Sem parcelas atrasadas.`,
      ].join("\n\n");
    }

    else if (context === "delivery") {
      // Either a single delivery (targetId) OR aggregate of late/upcoming deliveries
      const today = todayISO();
      const soon = new Date(); soon.setDate(soon.getDate() + 7);
      const soonISO = soon.toISOString().slice(0, 10);

      if (targetId) {
        const { data: d } = await supabase.from("deliveries")
          .select("id, title, description, brand, asset_type, quantity, due_date, delivered_at, status, approval, approval_comment, notes, property_id, opportunity_id")
          .eq("id", targetId).maybeSingle();
        if (!d) throw new Error("Entrega não encontrada");

        const [{ data: property }, { data: opp }] = await Promise.all([
          d.property_id ? supabase.from("sports_properties").select("name, category").eq("id", d.property_id).maybeSingle() : Promise.resolve({ data: null }),
          d.opportunity_id ? supabase.from("opportunities").select("brand, stage, sponsor_id").eq("id", d.opportunity_id).maybeSingle() : Promise.resolve({ data: null }),
        ]);

        const daysToDue = d.due_date ? Math.ceil((new Date(d.due_date).getTime() - Date.now()) / 86_400_000) : null;
        const isLate = d.due_date && d.due_date < today && d.status !== "entregue" && d.status !== "aprovada";

        ctx = [
          `CONTEXTO: Destravar entrega contratual (cobrar arte, agendar produção, alinhar com patrocinador).`,
          `Entrega: ${d.title} | Marca: ${d.brand} | Tipo: ${d.asset_type ?? "—"} | Qtd: ${d.quantity}`,
          `Status: ${d.status} | Aprovação: ${d.approval}`,
          d.due_date ? `Prazo: ${d.due_date} ${isLate ? `(ATRASADA há ${Math.abs(daysToDue!)} dias)` : daysToDue !== null && daysToDue <= 7 ? `(vence em ${daysToDue} dias)` : ""}` : `Sem prazo definido.`,
          d.description ? `Descrição: ${d.description}` : null,
          d.approval_comment ? `Comentário de aprovação: ${d.approval_comment}` : null,
          d.notes ? `Notas: ${d.notes}` : null,
          property ? `Propriedade: ${property.name} (${property.category})` : null,
          opp ? `Oportunidade vinculada: ${opp.brand} (${opp.stage})` : null,
        ].filter(Boolean).join("\n");
      } else {
        const [{ data: late }, { data: upcoming }] = await Promise.all([
          supabase.from("deliveries").select("title, brand, due_date, status, approval, asset_type")
            .eq("owner_id", uid).neq("status", "entregue").neq("status", "aprovada")
            .lt("due_date", today).order("due_date").limit(10),
          supabase.from("deliveries").select("title, brand, due_date, status, approval, asset_type")
            .eq("owner_id", uid).neq("status", "entregue").neq("status", "aprovada")
            .gte("due_date", today).lte("due_date", soonISO).order("due_date").limit(10),
        ]);

        ctx = [
          `CONTEXTO: Destravar entregas (cobrar arte, agendar produção, alinhar com patrocinador). Foque nas mais críticas.`,
          late?.length
            ? `ATRASADAS (${late.length}):\n${late.map((d: any) => `- ${d.title} (${d.brand}) — ${d.asset_type ?? "—"} | status ${d.status} | vencia ${d.due_date}`).join("\n")}`
            : `Nenhuma entrega atrasada.`,
          upcoming?.length
            ? `PRÓXIMAS 7 DIAS (${upcoming.length}):\n${upcoming.map((d: any) => `- ${d.title} (${d.brand}) — ${d.asset_type ?? "—"} | status ${d.status} | vence ${d.due_date}`).join("\n")}`
            : `Nada vencendo nos próximos 7 dias.`,
        ].join("\n\n");
      }
    }

    else if (context === "proposal") {
      if (!targetId) throw new Error("target_id obrigatório");
      const { data: p } = await supabase.from("proposals")
        .select("id, title, brand, status, total_value, sent_at, valid_until, message, sponsor_id, property_id, created_at")
        .eq("id", targetId).maybeSingle();
      if (!p) throw new Error("Proposta não encontrada");

      const [{ data: items }, { data: sponsor }, { data: property }] = await Promise.all([
        supabase.from("proposal_items").select("name, quantity, unit_value").eq("proposal_id", targetId).limit(20),
        p.sponsor_id ? supabase.from("sponsors").select("name, segment, score, last_contact_at").eq("id", p.sponsor_id).maybeSingle() : Promise.resolve({ data: null }),
        p.property_id ? supabase.from("sports_properties").select("name, category").eq("id", p.property_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);

      const today = todayISO();
      const daysSinceSent = daysSince(p.sent_at);
      const expired = p.valid_until && p.valid_until < today;

      const focus =
        p.status === "rascunho"
          ? "Rascunho — diga objetivamente o que falta para ENVIAR (itens, valor, validade, mensagem, contato, anexos)."
          : p.status === "enviada"
          ? `Enviada há ${daysSinceSent ?? "?"} dias sem resposta — sugira follow-up (canal/timing), ajuste de escopo ou desconto graduado, e gatilhos de urgência (validade).`
          : `Status ${p.status} — sugira ações de fechamento ou aprendizado.`;

      ctx = [
        `CONTEXTO: Acelerar proposta comercial. ${focus}`,
        `Proposta: ${p.title}${p.brand ? ` | Marca: ${p.brand}` : ""}`,
        `Status: ${p.status} | Valor: R$ ${p.total_value}`,
        p.sent_at ? `Enviada em: ${p.sent_at.slice(0, 10)} (há ${daysSinceSent}d)` : `Ainda não enviada.`,
        p.valid_until ? `Válida até: ${p.valid_until}${expired ? " (EXPIRADA)" : ""}` : `Sem validade definida.`,
        p.message ? `Mensagem: ${p.message}` : `Sem mensagem personalizada.`,
        items?.length
          ? `Itens (${items.length}):\n${items.map((i: any) => `- ${i.name} x${i.quantity} @ R$ ${i.unit_value}`).join("\n")}`
          : `SEM ITENS cadastrados.`,
        sponsor ? `Patrocinador: ${sponsor.name}${sponsor.segment ? ` (${sponsor.segment})` : ""} | Score: ${sponsor.score}${sponsor.last_contact_at ? ` | Último contato: ${sponsor.last_contact_at}` : ""}` : `Sem patrocinador vinculado.`,
        property ? `Propriedade: ${property.name} (${property.category})` : null,
      ].filter(Boolean).join("\n");
    }

    else {
      return new Response(JSON.stringify({ error: "context inválido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          { role: "user", content: ctx },
        ],
        tools: [{
          name: "next_steps",
          description: "Lista de próximos passos",
          input_schema: {
            type: "object",
            properties: {
              steps: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    activity_type: { type: "string", enum: ["ligacao", "email", "reuniao", "tarefa", "nota"] },
                    priority: { type: "string", enum: ["alta", "media", "baixa"] },
                    due_in_days: { type: "integer", minimum: 0, maximum: 30 },
                  },
                  required: ["title", "description", "activity_type", "priority", "due_in_days"],
                  additionalProperties: false,
                },
              },
            },
            required: ["steps"],
            additionalProperties: false,
          },
        }],
        tool_choice: { type: "tool", name: "next_steps" },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("next-steps error:", aiResp.status, t);
      return new Response(JSON.stringify({ error: aiResp.status === 429 ? "Rate limit" : aiResp.status === 402 ? "Créditos esgotados" : "Erro IA" }), {
        status: aiResp.status === 429 || aiResp.status === 402 ? aiResp.status : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const j = await aiResp.json();
    const toolUse = j.content?.find((b: any) => b.type === "tool_use");
    if (!toolUse?.input) {
      return new Response(JSON.stringify({ error: "Resposta inválida" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(toolUse.input), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-next-steps error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
