// Alertas de IA (backlog IA-30, IA-31): orçamento mensal e falha de chave exclusiva.
//
// Disparados após gravar `ai_usage_events`, sem atrasar a resposta ao usuário.
// Notificações in-app (`notifications`) com dedupe; e-mail opcional via Resend.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { appUrl, escapeHtml, sendEmail } from "../email.ts";
import type { CodigoDeErroDeIA } from "./erros.ts";
import type { EventoDeUso } from "./medicao.ts";

const ERROS_CHAVE_EXCLUSIVA: CodigoDeErroDeIA[] = ["chave_invalida", "sem_saldo"];

interface SituacaoOrcamento {
  orcamento_cents: number | null;
  alerta_pct: number;
  gasto_mes_brl: number;
  alerta_atingido: boolean;
  orcamento_esgotado: boolean;
}

function refMes(agora: Date): string {
  return agora.toISOString().slice(0, 7);
}

function refHora(agora: Date): string {
  const iso = agora.toISOString();
  return `${iso.slice(0, 10)}-${iso.slice(11, 13)}`;
}

function brl(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function nomeOrganizacao(admin: SupabaseClient, orgId: string): Promise<string> {
  const { data } = await admin.from("organizations").select("name").eq("id", orgId).maybeSingle();
  return data?.name?.trim() || "Organização";
}

async function lerSituacao(admin: SupabaseClient, orgId: string): Promise<SituacaoOrcamento | null> {
  const { data, error } = await admin.rpc("ia_situacao", { _org_id: orgId, _user_id: null });
  if (error || !data || typeof data !== "object") {
    console.error("[ia-alertas] ia_situacao falhou", error?.code ?? "?");
    return null;
  }
  const d = data as Record<string, unknown>;
  return {
    orcamento_cents: typeof d.orcamento_cents === "number" ? d.orcamento_cents : null,
    alerta_pct: typeof d.alerta_pct === "number" ? d.alerta_pct : 80,
    gasto_mes_brl: Number(d.gasto_mes_brl ?? 0),
    alerta_atingido: d.alerta_atingido === true,
    orcamento_esgotado: d.orcamento_esgotado === true,
  };
}

async function idsAdminsDaOrganizacao(admin: SupabaseClient, orgId: string): Promise<string[]> {
  const { data } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", orgId)
    .eq("status", "ativo")
    .in("role", ["owner", "admin"]);
  return (data ?? []).map((r) => r.user_id as string);
}

async function idsSuperadmins(admin: SupabaseClient): Promise<string[]> {
  const { data } = await admin.from("platform_admins").select("user_id").is("revoked_at", null);
  return (data ?? []).map((r) => r.user_id as string);
}

async function notificacaoExiste(admin: SupabaseClient, userId: string, dedupeKey: string): Promise<boolean> {
  const { data } = await admin
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();
  return !!data;
}

async function inserirNotificacao(
  admin: SupabaseClient,
  input: {
    user_id: string;
    organization_id: string;
    category: string;
    priority: "alta" | "media";
    title: string;
    description: string;
    action_url: string;
    dedupe_key: string;
  },
): Promise<boolean> {
  if (await notificacaoExiste(admin, input.user_id, input.dedupe_key)) return false;
  const { error } = await admin.from("notifications").insert(input);
  if (error) {
    console.error("[ia-alertas] insert notification", error.code ?? "?");
    return false;
  }
  return true;
}

async function emailDoUsuario(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user?.email) return null;
  return data.user.email;
}

async function enviarEmailAlerta(
  admin: SupabaseClient,
  userId: string,
  assunto: string,
  titulo: string,
  descricao: string,
  link: string,
): Promise<void> {
  const { data: prefs } = await admin
    .from("notification_preferences")
    .select("email_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (prefs && prefs.email_enabled === false) return;

  const email = await emailDoUsuario(admin, userId);
  if (!email) return;

  const base = appUrl();
  const href = link.startsWith("http") ? link : base ? `${base}${link}` : link;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="color:#0F1221">${escapeHtml(titulo)}</h2>
      <p style="color:#334155;line-height:1.6">${escapeHtml(descricao)}</p>
      ${
    href.startsWith("http")
      ? `<p style="margin-top:24px"><a href="${escapeHtml(href)}" style="background:#6206C8;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Abrir no Brandplay</a></p>`
      : ""
  }
    </div>`;
  await sendEmail({ to: email, subject: assunto, html });
}

async function notificarUsuarios(
  admin: SupabaseClient,
  userIds: string[],
  orgId: string,
  payload: Omit<Parameters<typeof inserirNotificacao>[1], "user_id" | "organization_id">,
): Promise<void> {
  const unicos = [...new Set(userIds)];
  for (const userId of unicos) {
    const inseriu = await inserirNotificacao(admin, {
      ...payload,
      user_id: userId,
      organization_id: orgId,
    });
    if (inseriu) {
      await enviarEmailAlerta(admin, userId, payload.title, payload.title, payload.description, payload.action_url);
    }
  }
}

export async function alertasOrcamentoPosUso(
  admin: SupabaseClient,
  orgId: string,
  agora: Date = new Date(),
): Promise<void> {
  const sit = await lerSituacao(admin, orgId);
  if (!sit?.orcamento_cents || sit.orcamento_cents <= 0) return;

  const nome = await nomeOrganizacao(admin, orgId);
  const mes = refMes(agora);
  const gasto = brl(sit.gasto_mes_brl);
  const teto = brl(sit.orcamento_cents / 100);
  const adminsOrg = await idsAdminsDaOrganizacao(admin, orgId);
  const superadmins = await idsSuperadmins(admin);

  if (sit.alerta_atingido && !sit.orcamento_esgotado) {
    const dedupe = `ia_orc_${orgId}_${mes}_p${sit.alerta_pct}`;
    const titulo = `Orçamento de IA em ${sit.alerta_pct}% — ${nome}`;
    const descricao = `Gasto estimado no mês: ${gasto} de ${teto} (${sit.alerta_pct}% do orçamento).`;
    await notificarUsuarios(admin, adminsOrg, orgId, {
      category: "ia_orcamento_alerta",
      priority: "media",
      title: titulo,
      description: descricao,
      action_url: "/dashboard/settings",
      dedupe_key: dedupe,
    });
    await notificarUsuarios(admin, superadmins, orgId, {
      category: "ia_orcamento_alerta",
      priority: "media",
      title: `[Plataforma] ${titulo}`,
      description: descricao,
      action_url: `/admin/ia/clientes/${orgId}`,
      dedupe_key: `${dedupe}_sa`,
    });
  }

  if (sit.orcamento_esgotado) {
    const dedupe = `ia_orc_${orgId}_${mes}_100`;
    const titulo = `Orçamento de IA esgotado — ${nome}`;
    const descricao = `Gasto estimado no mês: ${gasto} (limite ${teto}). Novas chamadas podem ser bloqueadas conforme a configuração.`;
    await notificarUsuarios(admin, adminsOrg, orgId, {
      category: "ia_orcamento_esgotado",
      priority: "alta",
      title: titulo,
      description: descricao,
      action_url: "/dashboard/settings",
      dedupe_key: dedupe,
    });
    await notificarUsuarios(admin, superadmins, orgId, {
      category: "ia_orcamento_esgotado",
      priority: "alta",
      title: `[Plataforma] ${titulo}`,
      description: descricao,
      action_url: `/admin/ia/clientes/${orgId}`,
      dedupe_key: `${dedupe}_sa`,
    });
  }
}

export async function alertaFalhaChaveExclusiva(
  admin: SupabaseClient,
  orgId: string,
  evento: EventoDeUso,
  agora: Date = new Date(),
): Promise<void> {
  if (evento.status !== "erro" || evento.credential_scope !== "exclusiva") return;
  if (!evento.error_code || !ERROS_CHAVE_EXCLUSIVA.includes(evento.error_code)) return;
  if (!evento.credential_id) return;

  const hora = refHora(agora);
  const dedupe = `ia_cred_falha_${evento.credential_id}_${hora}`;
  const nome = await nomeOrganizacao(admin, orgId);
  const titulo = `Falha na chave exclusiva de IA — ${nome}`;
  const descricao = evento.error_code === "sem_saldo"
    ? "A chave exclusiva da organização foi recusada por saldo ou limite no fornecedor."
    : "A chave exclusiva da organização foi recusada pelo fornecedor. Verifique a credencial no painel administrativo.";

  await notificarUsuarios(admin, await idsSuperadmins(admin), orgId, {
    category: "ia_chave_exclusiva",
    priority: "alta",
    title: titulo,
    description: descricao,
    action_url: `/admin/ia/clientes/${orgId}`,
    dedupe_key: dedupe,
  });
}

/** Fire-and-forget seguro após registrar uso na camada de IA. */
export function processarAlertasPosUso(
  admin: SupabaseClient | undefined,
  orgId: string,
  evento: EventoDeUso,
): void {
  if (!admin) return;
  void (async () => {
    try {
      if (evento.status !== "bloqueado") {
        await alertasOrcamentoPosUso(admin, orgId);
      }
      await alertaFalhaChaveExclusiva(admin, orgId, evento);
    } catch (e) {
      console.error("[ia-alertas] falha inesperada", e instanceof Error ? e.message : String(e));
    }
  })();
}

export { refMes, refHora, brl as formatarBrlAlerta };
