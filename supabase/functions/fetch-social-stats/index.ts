// Le seguidores e posts da pagina publica de uma rede social, para o
// cadastro de patrocinador (`SponsorProfileFields`).
//
// Exige usuario logado e so busca URLs das proprias redes — ver `busca.ts`
// para o porque (SSRF dentro da rede Docker do Supabase).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.3';
import { corsHeaders } from 'https://esm.sh/@supabase/supabase-js@2.103.3/cors';
import { buscarPagina, isNetwork, type Network, urlPermitida } from './busca.ts';

type Stat = { followers?: number | null; engagement?: number | null; posts?: number | null };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function parseCount(raw: string): number | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  const m = s.match(/([\d.,]+)\s*(k|m|b|mil|mi|bi)?/);
  if (!m) return null;
  let numPart = m[1];
  const suffix = m[2];
  // Normalize: if both . and , present, the last one is the decimal sep
  const lastDot = numPart.lastIndexOf('.');
  const lastComma = numPart.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const decIdx = Math.max(lastDot, lastComma);
    numPart = numPart.slice(0, decIdx).replace(/[.,]/g, '') + '.' + numPart.slice(decIdx + 1);
  } else if (lastComma >= 0) {
    numPart = numPart.length - lastComma - 1 <= 2 && suffix ? numPart.replace(',', '.') : numPart.replace(/,/g, '');
  } else if (lastDot >= 0) {
    numPart = numPart.length - lastDot - 1 <= 2 && suffix ? numPart : numPart.replace(/\./g, '');
  }
  const n = Number(numPart);
  if (!isFinite(n)) return null;
  const mult = suffix === 'k' || suffix === 'mil' ? 1e3 : suffix === 'm' || suffix === 'mi' ? 1e6 : suffix === 'b' || suffix === 'bi' ? 1e9 : 1;
  return Math.round(n * mult);
}

function meta(html: string, prop: string): string {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i');
  return (html.match(re)?.[1] ?? html.match(re2)?.[1] ?? '').replace(/&amp;/g, '&').replace(/&#\d+;/g, ' ');
}

function extract(network: Network, html: string): Stat {
  const desc = meta(html, 'og:description') || meta(html, 'description');
  const out: Stat = {};

  const jsonNum = (key: string) => {
    const m = html.match(new RegExp(`"${key}"\\s*:\\s*"?([\\d.,]+)"?`, 'i'));
    return m ? parseCount(m[1]) : null;
  };

  if (network === 'instagram') {
    out.followers =
      jsonNum('edge_followed_by\\"?\\s*:\\s*{\\s*\\"count') ??
      jsonNum('follower_count') ??
      parseCount(desc.match(/([\d.,kmbKMB]+)\s*(?:followers|seguidores)/i)?.[1] ?? '');
    out.posts = parseCount(desc.match(/([\d.,kmbKMB]+)\s*(?:posts|publica)/i)?.[1] ?? '');
  } else if (network === 'tiktok') {
    out.followers = jsonNum('followerCount') ?? parseCount(desc.match(/([\d.,kmbKMB]+)\s*(?:followers|seguidores)/i)?.[1] ?? '');
    out.posts = jsonNum('videoCount');
  } else if (network === 'youtube') {
    const subs = html.match(/"subscriberCountText"\s*:\s*{[^}]*?"(?:simpleText|content)"\s*:\s*"([^"]+)"/i)?.[1];
    out.followers = parseCount(subs ?? '') ?? jsonNum('subscriberCount');
    const vids = html.match(/"videosCountText"\s*:\s*{[^}]*?"text"\s*:\s*"([^"]+)"/i)?.[1];
    out.posts = parseCount(vids ?? '');
  } else if (network === 'facebook') {
    out.followers =
      parseCount(html.match(/([\d.,kmbKMB]+)\s*(?:followers|seguidores)/i)?.[1] ?? '') ??
      parseCount(desc.match(/([\d.,kmbKMB]+)\s*(?:likes|curtidas)/i)?.[1] ?? '');
  } else if (network === 'linkedin') {
    out.followers = parseCount(
      (html.match(/([\d.,kmbKMB]+)\s*(?:followers|seguidores)/i)?.[1] ?? desc.match(/([\d.,kmbKMB]+)\s*(?:followers|seguidores)/i)?.[1]) ?? '',
    );
  } else if (network === 'x') {
    out.followers = jsonNum('followers_count') ?? parseCount(desc.match(/([\d.,kmbKMB]+)\s*(?:followers|seguidores)/i)?.[1] ?? '');
    out.posts = jsonNum('statuses_count');
  }

  if (out.followers == null) delete out.followers;
  if (out.posts == null) delete out.posts;
  return out;
}

async function scrape(network: Network, url: URL): Promise<Stat & { error?: string }> {
  const pagina = await buscarPagina(network, url);
  if ('error' in pagina) return { error: pagina.error };
  const stat = extract(network, pagina.html);
  if (stat.followers == null && stat.posts == null) return { error: 'sem dados públicos' };
  return stat;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    // Ter um JWT nao basta: a anon key tambem e um JWT valido, e e publica.
    // `getUser()` confere a sessao no Auth.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401);
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) return json({ error: 'Não autenticado.' }, 401);

    // Do corpo, so `links` e lido.
    const body: unknown = await req.json().catch(() => null);
    const links = body && typeof body === 'object' ? (body as { links?: unknown }).links : undefined;
    if (!links || typeof links !== 'object' || Array.isArray(links)) {
      return json({ error: 'Nenhuma URL válida enviada' }, 400);
    }

    const stats: Partial<Record<Network, Stat & { error?: string }>> = {};
    const buscas: Promise<void>[] = [];
    for (const [k, v] of Object.entries(links as Record<string, unknown>)) {
      if (!isNetwork(k) || typeof v !== 'string') continue;
      const url = urlPermitida(k, v.trim(), { aceitarHttp: true });
      if (!url) {
        stats[k] = { error: 'URL não permitida para esta rede' };
        continue;
      }
      buscas.push(
        scrape(k, url).then((s) => {
          stats[k] = s;
        }),
      );
    }
    if (buscas.length === 0) return json({ error: 'Nenhuma URL válida enviada' }, 400);

    await Promise.all(buscas);
    return json({ stats });
  } catch {
    return json({ error: 'erro interno' }, 500);
  }
});
