// Apoio ao cadastro de postagens do relatório (ADR-0011).
//
//   POST { acao: "previa", url }            → rede, id e, quando há oEmbed
//                                             público (YouTube, TikTok),
//                                             título, autor e miniatura
//   POST { acao: "atualizar", property_id } → busca agora as métricas dos
//                                             vídeos do YouTube do projeto
//
// Exige usuário logado. "atualizar" exige escrita no módulo crm ou
// operacional da organização dona do projeto, que vem do banco, nunca do
// corpo. A prévia só consulta hosts fixos (youtube.com, tiktok.com): o link do
// usuário vai como parâmetro, o que fecha o caminho de SSRF que a
// `fetch-social-stats` já teve.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.3";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.103.3/cors";
import { logContexto } from "../_shared/observabilidade.ts";
import { atualizarMetricasYoutube } from "../_shared/metricas_youtube.ts";
import { identificarLink, lerOembed, urlOembed } from "../_shared/relatorio.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autenticado." }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData.user;
    if (!user) return json({ error: "Não autenticado." }, 401);

    const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const acao = corpo?.acao;

    if (acao === "previa") {
      logContexto(req, { user_id: user.id, code: "social_posts_previa" });
      const link = typeof corpo?.url === "string" ? identificarLink(corpo.url) : null;
      if (!link || link.url.length > 2048) return json({ error: "Link inválido. Use um endereço https." }, 400);
      const destino = urlOembed(link);
      let oembed = { titulo: null as string | null, autor: null as string | null, miniatura: null as string | null };
      if (destino) {
        try {
          const res = await fetch(destino, { redirect: "error", signal: AbortSignal.timeout(6_000) });
          if (res.ok) oembed = lerOembed(await res.json());
          else await res.body?.cancel();
        } catch {
          // Sem prévia: o cadastro segue com o título digitado.
        }
      }
      return json({ rede: link.rede, id_externo: link.idExterno, url: link.url, ...oembed });
    }

    if (acao === "atualizar") {
      const propertyId = corpo?.property_id;
      if (typeof propertyId !== "string" || !UUID.test(propertyId)) {
        return json({ error: "property_id inválido." }, 400);
      }
      const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: prop } = await admin
        .from("sports_properties")
        .select("organization_id")
        .eq("id", propertyId)
        .maybeSingle();
      const orgId = prop?.organization_id as string | undefined;
      if (!orgId) return json({ error: "Projeto não encontrado." }, 404);

      const [crm, operacional, bloqueadas] = await Promise.all([
        userClient.rpc("can_access_module", { _user_id: user.id, _org_id: orgId, _module: "crm", _write: true }),
        userClient.rpc("can_access_module", { _user_id: user.id, _org_id: orgId, _module: "operacional", _write: true }),
        userClient.rpc("billing_blocked_orgs"),
      ]);
      const bloqueada = Array.isArray(bloqueadas.data) && bloqueadas.data.includes(orgId);
      if ((crm.data !== true && operacional.data !== true) || bloqueada) {
        return json({ error: "Sem permissão para atualizar as métricas deste projeto." }, 403);
      }
      logContexto(req, { user_id: user.id, organization_id: orgId, code: "social_posts_atualizar" });

      const youtube = await atualizarMetricasYoutube(admin, propertyId, { forcar: true });
      const { data: manuais } = await admin
        .from("property_posts")
        .select("network")
        .eq("property_id", propertyId)
        .neq("network", "youtube");
      const semIntegracao: Record<string, number> = {};
      for (const p of manuais ?? []) semIntegracao[p.network] = (semIntegracao[p.network] ?? 0) + 1;

      return json({ youtube, sem_integracao: semIntegracao });
    }

    return json({ error: "Ação inválida." }, 400);
  } catch {
    return json({ error: "erro interno" }, 500);
  }
});
