// Página do relatório (`/r/:slug`, ADR-0011). Pública: é a única porta para
// quem não é membro chegar ao relatório.
//
//   POST { slug }
//
// Quem entra:
//   - membro ativo da organização (JWT), em qualquer status e modo: vê tudo,
//     inclusive o rascunho (prévia);
//   - usuário do portal do patrocinador do relatório, se publicado;
//   - qualquer pessoa, se publicado no modo público. Aí a página sai sem foto
//     marcada com menores e sem evidência de entrega (D10).
// Relatório excluído responde 410 com a mensagem de indisponível. O resto,
// 404, sem dizer se o endereço existe.
//
// Usa service role: a organização e o patrocinador vêm do próprio relatório,
// nunca do corpo. Os campos saem da lista de `report_landing_data` (0040), sem
// valor financeiro (D7). Métricas do YouTube vencidas são atualizadas em
// segundo plano, depois da resposta: a visita nunca espera a rede social.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.3";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.103.3/cors";
import { logContexto } from "../_shared/observabilidade.ts";
import { atualizarMetricasYoutube } from "../_shared/metricas_youtube.ts";
import { comOrigemPublica, slugValido, urlPublica } from "../_shared/relatorio.ts";

const MENSAGEM_EXCLUIDO =
  "Este relatório não está mais disponível. Entre em contato com o responsável pela conta.";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

interface Acesso {
  id: string;
  organization_id: string;
  property_id: string;
  sponsor_id: string | null;
  access_mode: "organizacao" | "publico";
  status: "rascunho" | "publicado" | "excluido";
}

interface Foto {
  id: string;
  path: string;
  legenda: string | null;
  momento_id: string | null;
  etiquetas: string[];
  capa: boolean;
  do_patrocinador: boolean;
}

interface Contrapartida {
  evidencias: { path: string; registrado_em: string | null }[];
  [campo: string]: unknown;
}

interface Dados {
  relatorio: Record<string, unknown>;
  organizacao: {
    nome: string;
    logo_path: string | null;
    primaria: string | null;
    secundaria: string | null;
    logos: Record<string, string>;
  } | null;
  propriedade: ({ capa_path: string | null } & Record<string, unknown>) | null;
  patrocinador: { id: string; nome: string; logo_path: string | null } | null;
  patrocinadores: { id: string; nome: string; logo_path: string | null; cota: string | null; nivel: string | null }[];
  momentos: unknown[];
  fotos: Foto[];
  posts: unknown[];
  indicadores: unknown[];
  contrapartidas: Contrapartida[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const corpo: unknown = await req.json().catch(() => null);
    const slug = corpo && typeof corpo === "object" ? (corpo as { slug?: unknown }).slug : undefined;
    if (!slugValido(slug)) return json({ error: "nao_encontrado" }, 404);

    const url = Deno.env.get("SUPABASE_URL")!;
    const base = Deno.env.get("SUPABASE_PUBLIC_URL") || url;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: acessoBruto, error: erroAcesso } = await admin
      .rpc("report_landing_acesso", { _slug: slug })
      .maybeSingle();
    if (erroAcesso) {
      console.error("report-view: falha ao ler o relatório");
      return json({ error: "erro interno" }, 500);
    }
    const acesso = acessoBruto as Acesso | null;
    if (!acesso) return json({ error: "nao_encontrado" }, 404);
    if (acesso.status === "excluido") return json({ error: "excluido", mensagem: MENSAGEM_EXCLUIDO }, 410);

    // Quem chama. A anon key também é um JWT válido: `getUser()` confere a
    // sessão no Auth, e sem usuário o visitante é anônimo.
    let userId: string | null = null;
    let membro = false;
    let patrocinador = false;
    let suspenso = false;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: userData } = await userClient.auth.getUser();
      if (userData.user) {
        userId = userData.user.id;
        const [{ data: ehMembro }, { data: bloqueadas }] = await Promise.all([
          userClient.rpc("is_org_member", { target_org_id: acesso.organization_id }),
          userClient.rpc("billing_blocked_orgs"),
        ]);
        // Organização sem acesso: o membro vê o mesmo bloqueio do painel; o
        // que foi publicado para fora continua no ar (D2).
        suspenso = ehMembro === true && Array.isArray(bloqueadas) && bloqueadas.includes(acesso.organization_id);
        membro = ehMembro === true && !suspenso;
        if (!membro && acesso.sponsor_id) {
          const { data: temAcesso } = await userClient.rpc("has_sponsor_portal_access", {
            target_sponsor_id: acesso.sponsor_id,
          });
          patrocinador = temAcesso === true;
        }
      }
    }

    const publicado = acesso.status === "publicado";
    let tipo: "organizacao" | "patrocinador" | "publico";
    if (membro) tipo = "organizacao";
    else if (publicado && patrocinador) tipo = "patrocinador";
    else if (publicado && acesso.access_mode === "publico") tipo = "publico";
    else if (suspenso) return json({ error: "suspenso" }, 403);
    else return json({ error: "nao_encontrado", login: userId === null }, 404);

    logContexto(req, {
      user_id: userId,
      organization_id: membro ? acesso.organization_id : null,
      code: `report_view_${tipo}`,
    });

    const publico = tipo === "publico";
    const { data: bruto, error: erroDados } = await admin.rpc("report_landing_data", {
      _report_id: acesso.id,
      _publico: publico,
    });
    if (erroDados || !bruto) {
      console.error("report-view: falha ao montar a página");
      return json({ error: "erro interno" }, 500);
    }
    const dados = bruto as Dados;

    // Evidência de entrega mora em bucket privado: URL assinada de uma hora.
    const evidencias = dados.contrapartidas.flatMap((c) => c.evidencias.map((e) => e.path));
    const assinadas = new Map<string, string>();
    if (!publico && evidencias.length > 0) {
      const { data: urls } = await admin.storage.from("delivery-evidence").createSignedUrls(evidencias, 3600);
      for (const u of urls ?? []) {
        if (u.path && u.signedUrl) assinadas.set(u.path, comOrigemPublica(u.signedUrl, base));
      }
    }

    const org = dados.organizacao;
    const pagina = {
      relatorio: dados.relatorio,
      organizacao: org && {
        nome: org.nome,
        primaria: org.primaria,
        secundaria: org.secundaria,
        logo_url: org.logo_path ? urlPublica(base, "org-logos", org.logo_path) : null,
        logos: Object.fromEntries(
          Object.entries(org.logos ?? {}).map(([kind, path]) => [kind, urlPublica(base, "org-logos", path)]),
        ),
      },
      propriedade: dados.propriedade && {
        ...Object.fromEntries(Object.entries(dados.propriedade).filter(([k]) => k !== "capa_path")),
        capa_url: dados.propriedade.capa_path
          ? urlPublica(base, "property-media", dados.propriedade.capa_path, 1920)
          : null,
      },
      patrocinador: dados.patrocinador && {
        id: dados.patrocinador.id,
        nome: dados.patrocinador.nome,
        logo_url: dados.patrocinador.logo_path
          ? urlPublica(base, "sponsor-logos", dados.patrocinador.logo_path)
          : null,
      },
      patrocinadores: dados.patrocinadores.map((p) => ({
        id: p.id,
        nome: p.nome,
        cota: p.cota,
        nivel: p.nivel,
        logo_url: p.logo_path ? urlPublica(base, "sponsor-logos", p.logo_path) : null,
      })),
      momentos: dados.momentos,
      fotos: dados.fotos.map(({ path, ...f }) => ({
        ...f,
        url: urlPublica(base, "property-media", path, 1920),
        miniatura: urlPublica(base, "property-media", path, 720),
      })),
      posts: dados.posts,
      indicadores: dados.indicadores,
      contrapartidas: dados.contrapartidas.map((c) => ({
        ...c,
        evidencias: c.evidencias
          .map((e) => ({ url: assinadas.get(e.path) ?? null, registrado_em: e.registrado_em }))
          .filter((e) => e.url),
      })),
      acesso: { tipo, previa: acesso.status === "rascunho" },
    };

    // Depois da resposta: o próximo visitante já vê o número novo.
    if (Deno.env.get("YOUTUBE_API_KEY")) {
      EdgeRuntime.waitUntil(
        atualizarMetricasYoutube(admin, acesso.property_id).catch(() => {
          console.error("report-view: falha ao atualizar métricas do YouTube");
        }),
      );
    }

    return json(pagina);
  } catch {
    return json({ error: "erro interno" }, 500);
  }
});
