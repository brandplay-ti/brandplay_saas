import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { appUrl, escapeHtml, sendEmail } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

type Action =
  | { action: "invite"; email: string; role: string; organization_id: string }
  | { action: "create_user"; email: string; password: string; role: string; full_name?: string; organization_id: string }
  | { action: "update_role"; member_id: string; role: string; organization_id: string }
  | { action: "revoke"; member_id: string; organization_id: string }
  | { action: "reactivate"; member_id: string; organization_id: string }
  | { action: "resend_invite"; invite_id: string; organization_id: string }
  | { action: "revoke_invite"; invite_id: string; organization_id: string };

const ROLES = ["owner", "admin", "comercial", "operacional", "financeiro"];

const ROLE_LABEL: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  comercial: "Comercial",
  operacional: "Operacional",
  financeiro: "Financeiro",
};

// O nome da organização é digitado por quem a administra: escapado.
const inviteEmail = (orgName: string, role: string, link: string) => `
  <div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto">
    <h2>Você foi convidado para <strong>${escapeHtml(orgName)}</strong></h2>
    <p>Você foi convidado como <strong>${escapeHtml(ROLE_LABEL[role] ?? role)}</strong>. Clique abaixo para criar sua conta e aceitar o convite.</p>
    <p><a href="${escapeHtml(link)}" style="display:inline-block;background:#6206C8;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Aceitar convite</a></p>
    <p style="color:#64748b;font-size:13px">Este convite expira em 14 dias.</p>
  </div>`;

const welcomeEmail = (orgName: string, role: string, email: string, password: string, link: string) => `
  <div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto">
    <h2>Bem-vindo a <strong>${escapeHtml(orgName)}</strong></h2>
    <p>Sua conta foi criada como <strong>${escapeHtml(ROLE_LABEL[role] ?? role)}</strong>.</p>
    <p><strong>E-mail:</strong> ${escapeHtml(email)}<br/><strong>Senha temporária:</strong> ${escapeHtml(password)}</p>
    <p><a href="${escapeHtml(link)}" style="display:inline-block;background:#6206C8;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Acessar plataforma</a></p>
    <p style="color:#64748b;font-size:13px">Recomendamos alterar sua senha no primeiro acesso.</p>
  </div>`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = (await req.json()) as Action;
    if (!body.organization_id) {
      return new Response(JSON.stringify({ error: "organization_id obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // verify user is owner/admin of org
    const { data: roleCheck } = await admin
      .from("organization_members")
      .select("role")
      .eq("organization_id", body.organization_id)
      .eq("user_id", userId)
      .eq("status", "ativo")
      .maybeSingle();

    if (!roleCheck || !["owner", "admin"].includes(roleCheck.role)) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: org } = await admin
      .from("organizations")
      .select("name")
      .eq("id", body.organization_id)
      .maybeSingle();
    const orgName = org?.name ?? "Equipe";
    // Base dos links do e-mail: APP_URL do ambiente. O `Origin` da requisição
    // só vale onde APP_URL não existe — quem chama não escolhe para onde o
    // convite aponta.
    const origin = appUrl() || (req.headers.get("origin") ?? "");

    const audit = async (entry: Record<string, unknown>) => {
      await admin.from("team_audit_log").insert({
        organization_id: body.organization_id,
        actor_id: userId,
        ...entry,
      });
    };

    if (body.action === "invite") {
      if (!ROLES.includes(body.role)) throw new Error("Papel inválido");
      const email = body.email.trim().toLowerCase();
      if (!email) throw new Error("E-mail obrigatório");

      const { data: existingUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const existing = existingUsers?.users?.find((u) => u.email?.toLowerCase() === email);

      if (existing) {
        const { error } = await admin
          .from("organization_members")
          .upsert(
            { organization_id: body.organization_id, user_id: existing.id, role: body.role as any, status: "ativo" },
            { onConflict: "organization_id,user_id" }
          );
        if (error) throw error;
        await sendEmail({ to: email, subject: `Você foi adicionado a ${orgName}`, html: inviteEmail(orgName, body.role, `${origin}/dashboard`) });
        await audit({ action: "member_created", target_email: email, target_user_id: existing.id, new_role: body.role });
        return new Response(JSON.stringify({ ok: true, mode: "added_existing" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: invite, error } = await admin
        .from("organization_invites")
        .insert({
          organization_id: body.organization_id,
          email,
          role: body.role as any,
          invited_by: userId,
        })
        .select()
        .single();
      if (error) throw error;

      const link = `${origin}/auth?invite=${invite.token}&email=${encodeURIComponent(email)}`;
      await sendEmail({ to: email, subject: `Convite para ${orgName}`, html: inviteEmail(orgName, body.role, link) });
      await audit({ action: "invite_sent", target_email: email, new_role: body.role, metadata: { invite_id: invite.id } });

      return new Response(JSON.stringify({ ok: true, mode: "invited", invite }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "resend_invite") {
      const { data: invite } = await admin
        .from("organization_invites")
        .select("*")
        .eq("id", body.invite_id)
        .eq("organization_id", body.organization_id)
        .maybeSingle();
      if (!invite) throw new Error("Convite não encontrado");

      // refresh expiration
      const newExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      await admin.from("organization_invites").update({ expires_at: newExpiresAt }).eq("id", invite.id);

      const link = `${origin}/auth?invite=${invite.token}&email=${encodeURIComponent(invite.email)}`;
      await sendEmail({ to: invite.email, subject: `Lembrete: convite para ${orgName}`, html: inviteEmail(orgName, invite.role, link) });
      await audit({ action: "invite_resent", target_email: invite.email, new_role: invite.role, metadata: { invite_id: invite.id } });

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "revoke_invite") {
      const { data: invite } = await admin
        .from("organization_invites")
        .select("email, role")
        .eq("id", body.invite_id)
        .eq("organization_id", body.organization_id)
        .maybeSingle();
      const { error } = await admin
        .from("organization_invites")
        .update({ status: "revogado" })
        .eq("id", body.invite_id)
        .eq("organization_id", body.organization_id);
      if (error) throw error;
      await audit({ action: "invite_revoked", target_email: invite?.email, old_role: invite?.role });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "create_user") {
      if (!ROLES.includes(body.role)) throw new Error("Papel inválido");
      const email = body.email.trim().toLowerCase();

      // Convite pendente ANTES de criar o usuário. O gatilho handle_new_user
      // aceita convite pendente do e-mail e vincula o membro à organização;
      // sem convite, ele cria uma organização pessoal — e o membro ganhava
      // uma segunda organização, só dele, com o nome desta.
      //
      // `app_metadata` não serve como sinal: o GoTrue grava o usuário primeiro
      // e o app_metadata num passo seguinte, e o gatilho roda no INSERT.
      const { data: convite, error: conviteErr } = await admin
        .from("organization_invites")
        .insert({ organization_id: body.organization_id, email, role: body.role as any, invited_by: userId })
        .select("id")
        .single();
      if (conviteErr) throw conviteErr;

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: body.password,
        email_confirm: true,
        user_metadata: { full_name: body.full_name ?? "", company: orgName },
      });
      if (createErr) {
        await admin.from("organization_invites").update({ status: "revogado" }).eq("id", convite.id);
        throw createErr;
      }
      const newUserId = created.user!.id;

      const { error: memberErr } = await admin
        .from("organization_members")
        .upsert(
          { organization_id: body.organization_id, user_id: newUserId, role: body.role as any, status: "ativo" },
          { onConflict: "organization_id,user_id" }
        );
      if (memberErr) throw memberErr;

      await sendEmail({ to: email, subject: `Bem-vindo a ${orgName}`, html: welcomeEmail(orgName, body.role, email, body.password, `${origin}/auth`) });
      await audit({ action: "member_created", target_email: email, target_user_id: newUserId, new_role: body.role });

      return new Response(JSON.stringify({ ok: true, user_id: newUserId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "update_role") {
      if (!ROLES.includes(body.role)) throw new Error("Papel inválido");
      const { data: prev } = await admin
        .from("organization_members")
        .select("user_id, role")
        .eq("id", body.member_id)
        .maybeSingle();
      const { error } = await admin
        .from("organization_members")
        .update({ role: body.role as any, updated_at: new Date().toISOString() })
        .eq("id", body.member_id)
        .eq("organization_id", body.organization_id);
      if (error) throw error;
      await audit({
        action: "role_changed",
        target_member_id: body.member_id,
        target_user_id: prev?.user_id,
        old_role: prev?.role,
        new_role: body.role,
      });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "revoke") {
      const { data: prev } = await admin
        .from("organization_members")
        .select("user_id, role")
        .eq("id", body.member_id)
        .maybeSingle();
      const { error } = await admin
        .from("organization_members")
        .update({ status: "revogado", updated_at: new Date().toISOString() })
        .eq("id", body.member_id)
        .eq("organization_id", body.organization_id);
      if (error) throw error;
      await audit({
        action: "member_revoked",
        target_member_id: body.member_id,
        target_user_id: prev?.user_id,
        old_role: prev?.role,
      });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "reactivate") {
      const { data: prev } = await admin
        .from("organization_members")
        .select("user_id, role")
        .eq("id", body.member_id)
        .maybeSingle();
      const { error } = await admin
        .from("organization_members")
        .update({ status: "ativo", updated_at: new Date().toISOString() })
        .eq("id", body.member_id)
        .eq("organization_id", body.organization_id);
      if (error) throw error;
      await audit({
        action: "member_reactivated",
        target_member_id: body.member_id,
        target_user_id: prev?.user_id,
        new_role: prev?.role,
      });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(e);
    // Limite do plano (gatilhos da 0024): devolve hint e plano sugerido para a
    // tela explicar o bloqueio, em vez de um 500 genérico.
    const limitePlano = typeof e?.hint === "string" && e.hint.startsWith("limite_plano:");
    return new Response(
      JSON.stringify({
        error: e.message ?? "Erro",
        ...(limitePlano ? { hint: e.hint, details: e.details ?? null } : {}),
      }),
      {
        status: limitePlano ? 409 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
