import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// === TOOL DEFINITIONS ===
const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_sponsors",
      description:
        "Busca patrocinadores do usuário. Filtros opcionais por nome, segmento, score (quente/morno/frio) ou dias sem contato.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Texto livre (nome/segmento)" },
          score: { type: "string", enum: ["quente", "morno", "frio"] },
          days_without_contact: { type: "number" },
          limit: { type: "number", default: 20 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_opportunities",
      description: "Busca oportunidades do pipeline. Filtros por estágio, marca, valor mínimo.",
      parameters: {
        type: "object",
        properties: {
          stage: {
            type: "string",
            enum: ["prospect", "reuniao", "proposta_enviada", "negociacao", "fechado", "perdido"],
          },
          brand: { type: "string" },
          min_value: { type: "number" },
          limit: { type: "number", default: 20 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_contracts",
      description: "Busca contratos. Filtros por status, marca, valor.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string" },
          brand: { type: "string" },
          limit: { type: "number", default: 20 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_overdue_installments",
      description: "Lista parcelas atrasadas ou com vencimento próximo.",
      parameters: {
        type: "object",
        properties: {
          days_ahead: { type: "number", default: 7, description: "Dias à frente para incluir vencimentos próximos" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pending_deliveries",
      description: "Lista entregas pendentes ou atrasadas.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["pendente", "em_producao", "atrasada"] },
          limit: { type: "number", default: 20 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_dashboard_metrics",
      description:
        "Retorna métricas agregadas: total de patrocinadores, oportunidades por estágio, valor do pipeline, receita do mês, contratos ativos.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "create_sponsor_interaction",
      description:
        "Registra uma interação manual com um patrocinador (reunião, ligação, e-mail, whatsapp, nota).",
      parameters: {
        type: "object",
        properties: {
          sponsor_id: { type: "string" },
          type: {
            type: "string",
            enum: ["reuniao", "ligacao", "email", "whatsapp", "nota"],
          },
          title: { type: "string" },
          description: { type: "string" },
          next_action: { type: "string" },
          next_action_at: { type: "string", description: "ISO date opcional" },
        },
        required: ["sponsor_id", "type", "title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_opportunity_activity",
      description: "Cria uma tarefa/atividade em uma oportunidade.",
      parameters: {
        type: "object",
        properties: {
          opportunity_id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          due_date: { type: "string", description: "ISO date" },
          activity_type: {
            type: "string",
            enum: ["nota", "ligacao", "reuniao", "email", "tarefa"],
          },
        },
        required: ["opportunity_id", "title"],
      },
    },
  },
];

// === TOOL EXECUTION ===
async function executeTool(
  supabase: any,
  userId: string,
  name: string,
  args: Record<string, unknown>,
) {
  try {
    switch (name) {
      case "search_sponsors": {
        let q = supabase
          .from("sponsors")
          .select("id, name, segment, score, last_contact_at, tags, website")
          .order("updated_at", { ascending: false })
          .limit((args.limit as number) || 20);
        if (args.query) q = q.or(`name.ilike.%${args.query}%,segment.ilike.%${args.query}%`);
        if (args.score) q = q.eq("score", args.score as string);
        if (args.days_without_contact) {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - (args.days_without_contact as number));
          q = q.or(`last_contact_at.lt.${cutoff.toISOString().slice(0, 10)},last_contact_at.is.null`);
        }
        const { data, error } = await q;
        if (error) throw error;
        return { count: data?.length ?? 0, items: data };
      }
      case "search_opportunities": {
        let q = supabase
          .from("opportunities")
          .select("id, brand, value, stage, expected_close_date, sponsor_id, last_stage_change_at")
          .order("updated_at", { ascending: false })
          .limit((args.limit as number) || 20);
        if (args.stage) q = q.eq("stage", args.stage as string);
        if (args.brand) q = q.ilike("brand", `%${args.brand}%`);
        if (args.min_value) q = q.gte("value", args.min_value as number);
        const { data, error } = await q;
        if (error) throw error;
        return { count: data?.length ?? 0, items: data };
      }
      case "search_contracts": {
        let q = supabase
          .from("contracts")
          .select("id, title, brand, status, total_value, start_date, end_date, sponsor_id")
          .order("updated_at", { ascending: false })
          .limit((args.limit as number) || 20);
        if (args.status) q = q.eq("status", args.status as string);
        if (args.brand) q = q.ilike("brand", `%${args.brand}%`);
        const { data, error } = await q;
        if (error) throw error;
        return { count: data?.length ?? 0, items: data };
      }
      case "get_overdue_installments": {
        const future = new Date();
        future.setDate(future.getDate() + ((args.days_ahead as number) || 7));
        const { data, error } = await supabase
          .from("installments")
          .select("id, contract_id, installment_number, total_installments, amount, due_date, status")
          .or(`status.eq.atrasado,and(status.eq.pendente,due_date.lte.${future.toISOString().slice(0, 10)})`)
          .order("due_date", { ascending: true })
          .limit(50);
        if (error) throw error;
        return { count: data?.length ?? 0, items: data };
      }
      case "get_pending_deliveries": {
        let q = supabase
          .from("deliveries")
          .select("id, title, brand, status, approval, due_date, quantity")
          .order("due_date", { ascending: true })
          .limit((args.limit as number) || 20);
        if (args.status) q = q.eq("status", args.status as string);
        else q = q.in("status", ["pendente", "em_producao", "atrasada"]);
        const { data, error } = await q;
        if (error) throw error;
        return { count: data?.length ?? 0, items: data };
      }
      case "get_dashboard_metrics": {
        const [sponsorsRes, oppsRes, contractsRes, installmentsRes] = await Promise.all([
          supabase.from("sponsors").select("id, score", { count: "exact" }),
          supabase.from("opportunities").select("stage, value"),
          supabase.from("contracts").select("status, total_value"),
          supabase
            .from("installments")
            .select("amount, status, paid_at")
            .gte("paid_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)),
        ]);
        const opps = oppsRes.data || [];
        const pipelineByStage: Record<string, { count: number; value: number }> = {};
        opps.forEach((o: any) => {
          pipelineByStage[o.stage] = pipelineByStage[o.stage] || { count: 0, value: 0 };
          pipelineByStage[o.stage].count++;
          pipelineByStage[o.stage].value += Number(o.value || 0);
        });
        const contracts = contractsRes.data || [];
        const activeContracts = contracts.filter((c: any) => c.status === "ativo");
        const monthRevenue = (installmentsRes.data || [])
          .filter((i: any) => i.status === "pago")
          .reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
        return {
          total_sponsors: sponsorsRes.count ?? 0,
          sponsors_by_score: (sponsorsRes.data || []).reduce((acc: any, s: any) => {
            acc[s.score] = (acc[s.score] || 0) + 1;
            return acc;
          }, {}),
          pipeline_by_stage: pipelineByStage,
          total_pipeline_value: opps.reduce((s: number, o: any) => s + Number(o.value || 0), 0),
          active_contracts_count: activeContracts.length,
          active_contracts_value: activeContracts.reduce((s: number, c: any) => s + Number(c.total_value || 0), 0),
          month_revenue_paid: monthRevenue,
        };
      }
      case "create_sponsor_interaction": {
        const { error } = await supabase.from("sponsor_interactions").insert({
          sponsor_id: args.sponsor_id,
          owner_id: userId,
          type: args.type,
          title: args.title,
          description: args.description ?? null,
          next_action: args.next_action ?? null,
          next_action_at: args.next_action_at ?? null,
          source: "manual",
        });
        if (error) throw error;
        return { success: true, message: "Interação registrada." };
      }
      case "create_opportunity_activity": {
        const { error } = await supabase.from("opportunity_activities").insert({
          opportunity_id: args.opportunity_id,
          owner_id: userId,
          title: args.title,
          description: args.description ?? null,
          due_date: args.due_date ?? null,
          activity_type: args.activity_type ?? "tarefa",
          status: "pendente",
        });
        if (error) throw error;
        return { success: true, message: "Atividade criada." };
      }
      default:
        return { error: `Tool desconhecida: ${name}` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "erro" };
  }
}

const SYSTEM_PROMPT = `Você é o "BrandAI", assistente do CRM de patrocínio esportivo.
Você ajuda o usuário a entender seu pipeline, patrocinadores, contratos, entregas e finanças.

REGRAS:
- Seja direto, conciso e profissional. Responda em português do Brasil.
- SEMPRE use as ferramentas disponíveis para consultar dados reais — nunca invente números, nomes ou status.
- Quando pedirem para "listar", "mostrar", "quantos", "quais", chame a ferramenta apropriada.
- Para ações (criar tarefa, registrar interação), confirme os parâmetros essenciais antes de executar se houver ambiguidade. Se o usuário foi explícito, execute direto.
- Formate respostas com markdown: use listas, **negrito** para destaques e tabelas quando útil.
- Valores em R$ usar formato BRL: R$ 1.234,56.
- Quando relevante, ofereça próximos passos sugeridos ao final.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const body = await req.json();
    const { conversationId, message } = body as {
      conversationId?: string;
      message: string;
    };
    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: "message obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Garantir conversa
    let convId = conversationId;
    if (!convId) {
      const { data: conv, error: convErr } = await supabase
        .from("ai_conversations")
        .insert({
          user_id: userId,
          title: message.slice(0, 60),
        })
        .select("id")
        .single();
      if (convErr) throw convErr;
      convId = conv.id;
    }

    // Salvar mensagem do usuário
    await supabase.from("ai_messages").insert({
      conversation_id: convId,
      role: "user",
      content: message,
    });

    // Carregar histórico
    const { data: history } = await supabase
      .from("ai_messages")
      .select("role, content, tool_calls, tool_call_id, tool_name")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true })
      .limit(50);

    const messages: any[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(history || []).map((m: any) => {
        if (m.role === "tool") {
          return { role: "tool", content: m.content, tool_call_id: m.tool_call_id };
        }
        if (m.role === "assistant" && m.tool_calls) {
          return { role: "assistant", content: m.content || "", tool_calls: m.tool_calls };
        }
        return { role: m.role, content: m.content };
      }),
    ];

    // Loop de tool calling (máx 5 iterações)
    let finalContent = "";
    for (let iter = 0; iter < 5; iter++) {
      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages,
          tools: TOOLS,
        }),
      });

      if (!aiResp.ok) {
        if (aiResp.status === 429) {
          return new Response(
            JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em instantes." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        if (aiResp.status === 402) {
          return new Response(
            JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos no workspace." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        const t = await aiResp.text();
        console.error("AI error", aiResp.status, t);
        throw new Error(`AI gateway erro ${aiResp.status}`);
      }

      const data = await aiResp.json();
      const choice = data.choices?.[0]?.message;
      if (!choice) throw new Error("Resposta IA vazia");

      // Sem tool calls → resposta final
      if (!choice.tool_calls || choice.tool_calls.length === 0) {
        finalContent = choice.content || "";
        await supabase.from("ai_messages").insert({
          conversation_id: convId,
          role: "assistant",
          content: finalContent,
        });
        break;
      }

      // Salva mensagem assistant com tool_calls
      await supabase.from("ai_messages").insert({
        conversation_id: convId,
        role: "assistant",
        content: choice.content || "",
        tool_calls: choice.tool_calls,
      });
      messages.push({
        role: "assistant",
        content: choice.content || "",
        tool_calls: choice.tool_calls,
      });

      // Executa cada tool e adiciona resultado
      for (const tc of choice.tool_calls) {
        const toolName = tc.function?.name;
        let toolArgs: any = {};
        try {
          toolArgs = JSON.parse(tc.function?.arguments || "{}");
        } catch {
          toolArgs = {};
        }
        const result = await executeTool(supabase, userId, toolName, toolArgs);
        const resultStr = JSON.stringify(result);
        await supabase.from("ai_messages").insert({
          conversation_id: convId,
          role: "tool",
          content: resultStr,
          tool_call_id: tc.id,
          tool_name: toolName,
        });
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: resultStr,
        });
      }
    }

    // Atualiza last_message_at
    await supabase
      .from("ai_conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", convId);

    return new Response(
      JSON.stringify({ conversationId: convId, content: finalContent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("ai-assistant error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
