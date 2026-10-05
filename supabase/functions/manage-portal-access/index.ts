// Edge function para gerenciar acessos ao Portal do Patrocinador.
// Ações: 'activate' (vincula conta existente), 'invite' (gera convite), 'revoke'.
// Para 'activate' e 'invite' envia e-mail via Resend (se configurado).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
  action: "activate" | "invite" | "revoke";
  sponsor_id: string;
  email?: string;
  access_id?: string; // for revoke
  portal_url?: string; // base URL do portal (ex: https://app.com)
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const PORTAL_URL_ENV = Deno.env.get("PORTAL_URL");

// HTML escape to prevent injection into email templates
const escHtml = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// Only allow https URLs from the app's own origins (lovable.app, lovableproject.com, or PORTAL_URL_ENV host)
function safePortalUrl(candidate: string | undefined, reqOrigin: string | null): string {
  const fallback = PORTAL_URL_ENV || reqOrigin || "";
  if (!candidate) return fallback;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "https:") return fallback;
    const host = u.host.toLowerCase();
    const allowed =
      host.endsWith(".lovable.app") ||
      host.endsWith(".lovableproject.com") ||
      host.endsWith(".lovable.dev") ||
      (PORTAL_URL_ENV && host === new URL(PORTAL_URL_ENV).host) ||
      (reqOrigin && host === new URL(reqOrigin).host);
    if (!allowed) return fallback;
    return `${u.protocol}//${u.host}`;
  } catch {
    return fallback;
  }
}


async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY ausente, pulando envio de e-mail");
    return { sent: false, reason: "no_api_key" };
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Portal Patrocinador <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
    }),
  });
  const data = await r.json();
  if (!r.ok) {
    console.error("Resend error", data);
    return { sent: false, reason: "resend_error", detail: data };
  }
  return { sent: true, id: data.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as RequestBody;
    if (!body.action || !body.sponsor_id) {
      return new Response(JSON.stringify({ error: "missing_params" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Confere se o usuário é dono do patrocinador (ou admin)
    const { data: sponsor } = await admin
      .from("sponsors")
      .select("id, name, owner_id")
      .eq("id", body.sponsor_id)
      .maybeSingle();
    if (!sponsor) {
      return new Response(JSON.stringify({ error: "sponsor_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (sponsor.owner_id !== user.id && !isAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const portalUrl = safePortalUrl(body.portal_url, req.headers.get("origin"));


    // ============ REVOKE ============
    if (body.action === "revoke") {
      if (!body.access_id) {
        return new Response(JSON.stringify({ error: "missing_access_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await admin
        .from("sponsor_portal_access")
        .delete()
        .eq("id", body.access_id)
        .eq("sponsor_id", body.sponsor_id);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!body.email) {
      return new Response(JSON.stringify({ error: "missing_email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const email = body.email.trim().toLowerCase();

    // ============ ACTIVATE ============
    if (body.action === "activate") {
      // Procura usuário existente
      const { data: list } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      const target = list?.users?.find(
        (u) => u.email?.toLowerCase() === email,
      );
      if (!target) {
        return new Response(
          JSON.stringify({
            error: "user_not_found",
            message:
              "Esse e-mail não tem conta. Use 'Enviar convite' para que ele possa criar uma.",
          }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Já tem acesso?
      const { data: existing } = await admin
        .from("sponsor_portal_access")
        .select("id, status")
        .eq("sponsor_id", body.sponsor_id)
        .eq("user_id", target.id)
        .maybeSingle();

      if (existing) {
        if (existing.status !== "ativo") {
          await admin
            .from("sponsor_portal_access")
            .update({ status: "ativo", updated_at: new Date().toISOString() })
            .eq("id", existing.id);
        }
      } else {
        const { error: insErr } = await admin
          .from("sponsor_portal_access")
          .insert({
            sponsor_id: body.sponsor_id,
            user_id: target.id,
            granted_by: user.id,
            status: "ativo",
          });
        if (insErr) throw insErr;
      }

      const loginUrl = `${portalUrl}/portal/login`;
      const emailRes = await sendEmail(
        email,
        `Acesso liberado: Portal ${sponsor.name}`,
        `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
          <h2 style="color:#0f172a">Seu acesso foi ativado 🎉</h2>
          <p>Você agora tem acesso ao <strong>Portal do Patrocinador</strong> de <strong>${escHtml(sponsor.name)}</strong>.</p>
          <p>Faça login com este e-mail (<strong>${escHtml(email)}</strong>) para acompanhar entregas, contratos e relatórios.</p>
          <p style="margin:32px 0">
            <a href="${escHtml(loginUrl)}" style="background:#0f172a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Acessar o Portal</a>
          </p>
          <p style="color:#64748b;font-size:13px">Se o botão não funcionar, copie e cole: ${escHtml(loginUrl)}</p>
        </div>`,
      );

      return new Response(
        JSON.stringify({ ok: true, mode: "activated", email: emailRes }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ============ INVITE ============
    if (body.action === "invite") {
      // Cria/atualiza convite pendente
      const { data: existing } = await admin
        .from("sponsor_invites")
        .select("id, token, status")
        .eq("sponsor_id", body.sponsor_id)
        .eq("email", email)
        .maybeSingle();

      let token: string;
      if (existing && existing.status === "pendente") {
        token = existing.token;
        await admin
          .from("sponsor_invites")
          .update({
            expires_at: new Date(
              Date.now() + 14 * 24 * 60 * 60 * 1000,
            ).toISOString(),
          })
          .eq("id", existing.id);
      } else {
        const { data: ins, error: insErr } = await admin
          .from("sponsor_invites")
          .insert({
            sponsor_id: body.sponsor_id,
            email,
            invited_by: user.id,
          })
          .select("token")
          .single();
        if (insErr) throw insErr;
        token = ins.token;
      }

      const inviteUrl = `${portalUrl}/portal/login?invite=${token}`;
      const emailRes = await sendEmail(
        email,
        `Convite: Portal ${sponsor.name}`,
        `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
          <h2 style="color:#0f172a">Você foi convidado 🤝</h2>
          <p>Você foi convidado para acessar o <strong>Portal do Patrocinador</strong> de <strong>${escHtml(sponsor.name)}</strong>.</p>
          <p>Clique no botão abaixo para criar sua conta e começar.</p>
          <p style="margin:32px 0">
            <a href="${escHtml(inviteUrl)}" style="background:#0f172a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Aceitar convite</a>
          </p>
          <p style="color:#64748b;font-size:13px">Se o botão não funcionar, copie e cole: ${escHtml(inviteUrl)}</p>
          <p style="color:#94a3b8;font-size:12px">Este convite expira em 14 dias.</p>
        </div>`,
      );

      return new Response(
        JSON.stringify({
          ok: true,
          mode: "invited",
          invite_url: inviteUrl,
          email: emailRes,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ error: "invalid_action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("manage-portal-access error", e);
    return new Response(
      JSON.stringify({ error: "internal", message: e?.message ?? String(e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
