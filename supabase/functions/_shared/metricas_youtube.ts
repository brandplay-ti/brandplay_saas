// Atualiza views, curtidas e comentários dos vídeos do YouTube cadastrados
// numa propriedade (`property_posts`). Usada pela `report-view` (em segundo
// plano, quando o cache venceu) e pela `social-posts` (botão "Atualizar
// métricas").
//
// Só o YouTube tem métrica de vídeo de terceiros por chave de API. Instagram,
// TikTok e Facebook exigem a conta conectada por OAuth e App Review (ADR-0011):
// até lá a métrica deles é manual.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.103.3";
import { emLotes, lerVideosYoutube, precisaAtualizar, urlVideosYoutube } from "./relatorio.ts";

const TIMEOUT_MS = 8_000;

export interface ResultadoYoutube {
  configurado: boolean;
  consultados: number;
  atualizados: number;
  falhou: boolean;
}

/**
 * `forcar` ignora o cache de uma hora (botão do editor). Antes de chamar a
 * API, grava `metrics_checked_at` dos posts escolhidos: duas visitas
 * simultâneas não buscam o mesmo vídeo duas vezes, e uma falha da rede segura
 * a próxima tentativa pelo mesmo intervalo.
 */
export async function atualizarMetricasYoutube(
  admin: SupabaseClient,
  propertyId: string,
  { forcar = false, agora = Date.now() }: { forcar?: boolean; agora?: number } = {},
): Promise<ResultadoYoutube> {
  const chave = Deno.env.get("YOUTUBE_API_KEY") ?? "";
  if (!chave) return { configurado: false, consultados: 0, atualizados: 0, falhou: false };

  const { data, error } = await admin
    .from("property_posts")
    .select("id, external_id, title, published_at, metrics_checked_at")
    .eq("property_id", propertyId)
    .eq("network", "youtube")
    .not("external_id", "is", null);
  if (error) return { configurado: true, consultados: 0, atualizados: 0, falhou: true };

  const posts = (data ?? []).filter((p) => forcar || precisaAtualizar(p.metrics_checked_at, agora));
  if (posts.length === 0) return { configurado: true, consultados: 0, atualizados: 0, falhou: false };

  await admin
    .from("property_posts")
    .update({ metrics_checked_at: new Date(agora).toISOString() })
    .in("id", posts.map((p) => p.id));

  let atualizados = 0;
  let falhou = false;
  const ids = [...new Set(posts.map((p) => p.external_id as string))];
  for (const lote of emLotes(ids)) {
    let corpo: unknown;
    try {
      const res = await fetch(urlVideosYoutube(lote, chave), { signal: AbortSignal.timeout(TIMEOUT_MS) });
      corpo = await res.json();
      if (!res.ok) {
        // A mensagem do Google pode repetir a URL com a chave: não vai para o log.
        console.error(`youtube: videos.list respondeu ${res.status}`);
        falhou = true;
        continue;
      }
    } catch {
      console.error("youtube: falha ao consultar videos.list");
      falhou = true;
      continue;
    }

    const metricas = lerVideosYoutube(corpo);
    const quando = new Date().toISOString();
    for (const post of posts) {
      const m = metricas.get(post.external_id as string);
      if (!m) continue;
      const { error: erroUpdate } = await admin
        .from("property_posts")
        .update({
          views: m.views,
          likes: m.likes,
          comments: m.comentarios,
          metrics_source: "api",
          metrics_updated_at: quando,
          title: post.title ?? m.titulo,
          published_at: post.published_at ?? m.publicadoEm,
        })
        .eq("id", post.id);
      if (!erroUpdate) atualizados++;
    }
  }

  return { configurado: true, consultados: posts.length, atualizados, falhou };
}
