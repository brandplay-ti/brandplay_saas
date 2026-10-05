import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotifInput {
  user_id: string;
  category: string;
  priority: "alta" | "media" | "baixa";
  title: string;
  description?: string;
  action_url?: string;
  related_entity_type?: string;
  related_entity_id?: string;
  dedupe_key: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use user's client (RLS) for inserts so user_id matches auth.uid()
    const supabase = userClient;

    // Load preferences
    const { data: prefRow } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    const prefs = prefRow ?? { email_enabled: true, inapp_enabled: true, categories: {} as Record<string, boolean> };
    const cats = (prefs.categories || {}) as Record<string, boolean>;
    const isOn = (k: string) => cats[k] !== false;

    const today = new Date();
    const inDays = (n: number) => {
      const d = new Date(today); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10);
    };
    const todayISO = today.toISOString().slice(0, 10);
    const sevenDaysAgo = (() => { const d = new Date(today); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); })();
    const fourteenDaysAgo = (() => { const d = new Date(today); d.setDate(d.getDate() - 14); return d.toISOString().slice(0, 10); })();

    const notifs: NotifInput[] = [];

    if (isOn("installment_due")) {
      const { data: dueSoon } = await supabase
        .from("installments")
        .select("id, amount, due_date, contract_id, status")
        .eq("status", "pendente")
        .gte("due_date", todayISO)
        .lte("due_date", inDays(7));
      (dueSoon ?? []).forEach((i: any) => {
        notifs.push({
          user_id: user.id,
          category: "installment_due",
          priority: "media",
          title: `Parcela vence em breve`,
          description: `R$ ${Number(i.amount).toLocaleString("pt-BR")} vence em ${new Date(i.due_date).toLocaleDateString("pt-BR")}`,
          action_url: "/dashboard/financeiro",
          related_entity_type: "installment",
          related_entity_id: i.id,
          dedupe_key: `inst_due_${i.id}_${i.due_date}`,
        });
      });
    }

    if (isOn("installment_overdue")) {
      const { data: overdue } = await supabase
        .from("installments")
        .select("id, amount, due_date")
        .eq("status", "atrasado");
      (overdue ?? []).forEach((i: any) => {
        notifs.push({
          user_id: user.id,
          category: "installment_overdue",
          priority: "alta",
          title: `Parcela atrasada`,
          description: `R$ ${Number(i.amount).toLocaleString("pt-BR")} vencida em ${new Date(i.due_date).toLocaleDateString("pt-BR")}`,
          action_url: "/dashboard/financeiro",
          related_entity_type: "installment",
          related_entity_id: i.id,
          dedupe_key: `inst_over_${i.id}`,
        });
      });
    }

    if (isOn("delivery_late")) {
      const { data: lateDeliveries } = await supabase
        .from("deliveries")
        .select("id, title, due_date, status")
        .lt("due_date", todayISO)
        .in("status", ["pendente", "em_producao"]);
      (lateDeliveries ?? []).forEach((d: any) => {
        notifs.push({
          user_id: user.id,
          category: "delivery_late",
          priority: "alta",
          title: `Entrega atrasada: ${d.title}`,
          description: `Vencia em ${new Date(d.due_date).toLocaleDateString("pt-BR")}`,
          action_url: "/dashboard/entregas",
          related_entity_type: "delivery",
          related_entity_id: d.id,
          dedupe_key: `del_late_${d.id}`,
        });
      });
    }

    if (isOn("proposal_expiring")) {
      const { data: expiringProps } = await supabase
        .from("proposals")
        .select("id, title, valid_until")
        .eq("status", "enviada")
        .gte("valid_until", todayISO)
        .lte("valid_until", inDays(7));
      (expiringProps ?? []).forEach((p: any) => {
        notifs.push({
          user_id: user.id,
          category: "proposal_expiring",
          priority: "media",
          title: `Proposta expira: ${p.title}`,
          description: `Validade até ${new Date(p.valid_until).toLocaleDateString("pt-BR")}`,
          action_url: "/dashboard/propostas",
          related_entity_type: "proposal",
          related_entity_id: p.id,
          dedupe_key: `prop_exp_${p.id}_${p.valid_until}`,
        });
      });
    }

    if (isOn("opportunity_stale")) {
      const { data: staleOpps } = await supabase
        .from("opportunities")
        .select("id, brand, stage, last_stage_change_at")
        .not("stage", "in", "(fechado,perdido)")
        .lt("last_stage_change_at", fourteenDaysAgo);
      (staleOpps ?? []).forEach((o: any) => {
        notifs.push({
          user_id: user.id,
          category: "opportunity_stale",
          priority: "media",
          title: `Oportunidade parada: ${o.brand}`,
          description: `Sem movimento há mais de 14 dias (etapa: ${o.stage})`,
          action_url: "/dashboard/pipeline",
          related_entity_type: "opportunity",
          related_entity_id: o.id,
          dedupe_key: `opp_stale_${o.id}_${sevenDaysAgo}`,
        });
      });
    }

    if (isOn("churn_risk")) {
      const { data: risks } = await supabase
        .from("contract_churn_risk")
        .select("contract_id, risk_level, risk_score")
        .in("risk_level", ["critico", "alto"]);
      (risks ?? []).forEach((r: any) => {
        notifs.push({
          user_id: user.id,
          category: "churn_risk",
          priority: "alta",
          title: `Risco de churn ${r.risk_level}`,
          description: `Contrato com score ${r.risk_score}/100. Reveja relacionamento.`,
          action_url: "/dashboard/contratos",
          related_entity_type: "contract",
          related_entity_id: r.contract_id,
          dedupe_key: `churn_${r.contract_id}_${r.risk_level}`,
        });
      });
    }

    // ---- Conta 360º: alertas de relacionamento ----
    const { data: accounts } = await supabase
      .from("sponsors")
      .select("id, name, lifecycle, last_contact_at, next_action, archived_at");
    const activeAccounts = (accounts ?? []).filter((s: any) => !s.archived_at);

    if (isOn("account_inactive")) {
      const dayMs = 86400000;
      activeAccounts.forEach((s: any) => {
        if (!s.last_contact_at) return;
        const days = Math.floor((today.getTime() - new Date(s.last_contact_at).getTime()) / dayMs);
        const bucket = days >= 60 ? 60 : days >= 45 ? 45 : days >= 30 ? 30 : null;
        if (!bucket) return;
        notifs.push({
          user_id: user.id,
          category: "account_inactive",
          priority: bucket >= 60 ? "alta" : "media",
          title: `Conta sem contato: ${s.name}`,
          description: `Sem interação registrada há ${days} dia(s).`,
          action_url: `/dashboard/patrocinadores/${s.id}`,
          related_entity_type: "sponsor",
          related_entity_id: s.id,
          dedupe_key: `acct_inactive_${s.id}_${bucket}`,
        });
      });
    }

    if (isOn("account_no_next_action")) {
      activeAccounts
        .filter((s: any) => !s.next_action && ["em_abordagem", "qualificado", "em_negociacao", "cliente_ativo"].includes(s.lifecycle))
        .forEach((s: any) => {
          notifs.push({
            user_id: user.id,
            category: "account_no_next_action",
            priority: "media",
            title: `Sem próxima ação: ${s.name}`,
            description: "Defina a próxima tarefa para manter a conta avançando.",
            action_url: `/dashboard/patrocinadores/${s.id}`,
            related_entity_type: "sponsor",
            related_entity_id: s.id,
            dedupe_key: `acct_no_next_${s.id}_${todayISO.slice(0, 7)}`,
          });
        });
    }

    if (isOn("contract_renewal")) {
      const { data: ending } = await supabase
        .from("contracts")
        .select("id, title, end_date, status, sponsor_id")
        .eq("status", "ativo")
        .gte("end_date", todayISO)
        .lte("end_date", inDays(180));
      (ending ?? []).forEach((c: any) => {
        const days = Math.ceil((new Date(c.end_date).getTime() - today.getTime()) / 86400000);
        const window = days <= 60 ? 60 : days <= 90 ? 90 : days <= 120 ? 120 : 180;
        notifs.push({
          user_id: user.id,
          category: "contract_renewal",
          priority: window <= 90 ? "alta" : "media",
          title: `Renovação em ${days} dia(s): ${c.title}`,
          description: "Inicie a conversa de renovação com o patrocinador.",
          action_url: c.sponsor_id ? `/dashboard/patrocinadores/${c.sponsor_id}` : "/dashboard/contratos",
          related_entity_type: "contract",
          related_entity_id: c.id,
          dedupe_key: `renewal_${c.id}_${window}`,
        });
      });
    }

    if (isOn("account_duplicate")) {
      const seen = new Map<string, any>();
      activeAccounts.forEach((s: any) => {
        const key = String(s.name || "").trim().toLowerCase();
        if (!key) return;
        const first = seen.get(key);
        if (first) {
          notifs.push({
            user_id: user.id,
            category: "account_duplicate",
            priority: "baixa",
            title: `Possível conta duplicada: ${s.name}`,
            description: "Duas contas com o mesmo nome. Avalie mesclar preservando o histórico.",
            action_url: "/dashboard/patrocinadores",
            related_entity_type: "sponsor",
            related_entity_id: s.id,
            dedupe_key: `acct_dup_${[first.id, s.id].sort().join("_")}`,
          });
        } else {
          seen.set(key, s);
        }
      });
    }

    // ---- Tarefas: perto do vencimento e atrasadas ----
    const fmtDate = (d: string) => new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR");
    const daysUntil = (d: string) =>
      Math.ceil((new Date(`${String(d).slice(0, 10)}T00:00:00`).getTime() - new Date(`${todayISO}T00:00:00`).getTime()) / 86400000);

    const taskDueSoonOn = isOn("task_due_soon");
    const taskOverdueOn = isOn("task_overdue");

    if (taskDueSoonOn || taskOverdueOn) {
      const [crmR, actR, checkR] = await Promise.all([
        supabase
          .from("crm_tasks")
          .select("id,title,due_date,priority,status,sponsor_id")
          .eq("assignee_id", user.id)
          .eq("status", "aberta")
          .not("due_date", "is", null)
          .lte("due_date", inDays(3)),
        supabase
          .from("opportunity_activities")
          .select("id,title,due_date,completed_at,opportunity_id")
          .eq("owner_id", user.id)
          .is("completed_at", null)
          .not("due_date", "is", null)
          .lte("due_date", `${inDays(3)}T23:59:59`),
        supabase
          .from("property_checklist_items")
          .select("id,title,due_date,completed_at,property_id")
          .eq("owner_id", user.id)
          .is("completed_at", null)
          .not("due_date", "is", null)
          .lte("due_date", inDays(3)),
      ]);


      const items: { id: string; title: string; due: string; url: string; kind: string }[] = [
        ...((crmR.data ?? []) as any[]).map((t) => ({
          id: t.id,
          title: t.title,
          due: t.due_date,
          kind: "crm",
          url: t.sponsor_id ? `/dashboard/patrocinadores/${t.sponsor_id}` : "/dashboard/calendario",
        })),
        ...((actR.data ?? []) as any[]).map((t) => ({
          id: t.id,
          title: t.title,
          due: t.due_date,
          kind: "atividade",
          url: "/dashboard/pipeline",
        })),
        ...((checkR.data ?? []) as any[]).map((t) => ({
          id: t.id,
          title: t.title,
          due: t.due_date,
          kind: "checklist",
          url: t.property_id ? `/dashboard/propriedades/${t.property_id}` : "/dashboard/calendario",
        })),
      ];

      items.forEach((t) => {
        const days = daysUntil(t.due);
        if (days < 0) {
          if (!taskOverdueOn) return;
          notifs.push({
            user_id: user.id,
            category: "task_overdue",
            priority: "alta",
            title: `Tarefa atrasada: ${t.title}`,
            description: `Venceu em ${fmtDate(t.due)} (${Math.abs(days)} dia(s) de atraso).`,
            action_url: t.url,
            related_entity_type: `task_${t.kind}`,
            related_entity_id: t.id,
            dedupe_key: `task_over_${t.kind}_${t.id}_${String(t.due).slice(0, 10)}`,
          });
        } else {
          if (!taskDueSoonOn) return;
          notifs.push({
            user_id: user.id,
            category: "task_due_soon",
            priority: days <= 1 ? "alta" : "media",
            title: days === 0 ? `Tarefa vence hoje: ${t.title}` : `Tarefa vence em ${days} dia(s): ${t.title}`,
            description: `Prazo em ${fmtDate(t.due)}.`,
            action_url: t.url,
            related_entity_type: `task_${t.kind}`,
            related_entity_id: t.id,
            dedupe_key: `task_soon_${t.kind}_${t.id}_${String(t.due).slice(0, 10)}`,
          });
        }
      });
    }


    // Insert with deduplication
    let inserted = 0;
    let emailQueue: NotifInput[] = [];
    for (const n of notifs) {
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", user.id)
        .eq("dedupe_key", n.dedupe_key)
        .maybeSingle();
      if (existing) continue;
      const { data: newRow, error } = await supabase
        .from("notifications")
        .insert(n)
        .select("id, priority")
        .single();
      if (!error && newRow) {
        inserted++;
        if (prefs.email_enabled && (n.priority === "alta" || n.priority === "media")) {
          emailQueue.push(n);
        }
      }
    }

    // Send email digest via Resend
    let emailsSent = 0;
    if (emailQueue.length > 0 && prefs.email_enabled) {
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      if (RESEND_API_KEY && user.email) {
        const items = emailQueue
          .map((n) => `<li><strong>${n.title}</strong>${n.description ? `<br><span style="color:#64748b">${n.description}</span>` : ""}</li>`)
          .join("");
        const html = `
          <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px">
            <h2 style="color:#0f172a">Você tem ${emailQueue.length} novidade(s) no Scout</h2>
            <ul style="line-height:1.7;padding-left:18px">${items}</ul>
            <p style="margin-top:24px">
              <a href="${Deno.env.get("SUPABASE_URL")?.replace(".supabase.co", ".lovable.app") || "#"}/dashboard"
                 style="background:hsl(217 91% 60%);color:white;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">
                 Abrir Scout
              </a>
            </p>
            <p style="color:#94a3b8;font-size:12px;margin-top:32px">Você está recebendo este e-mail porque ativou notificações em sua conta. Ajuste em Configurações.</p>
          </div>`;
        try {
          const r = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "Scout <onboarding@resend.dev>",
              to: [user.email],
              subject: `Scout: ${emailQueue.length} novidade(s) precisam da sua atenção`,
              html,
            }),
          });
          if (r.ok) {
            emailsSent = emailQueue.length;
            const ids = emailQueue.map((n) => n.dedupe_key);
            await supabase
              .from("notifications")
              .update({ email_sent_at: new Date().toISOString() })
              .eq("user_id", user.id)
              .in("dedupe_key", ids);
          } else {
            console.error("Resend error", await r.text());
          }
        } catch (e) {
          console.error("Email send failed", e);
        }
      }
    }

    return new Response(JSON.stringify({ inserted, total_checked: notifs.length, emails_sent: emailsSent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("check-notifications error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
