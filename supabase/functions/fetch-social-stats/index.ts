import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

type Stat = { followers?: number | null; engagement?: number | null; posts?: number | null };

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

const NETWORKS = ['instagram', 'facebook', 'youtube', 'tiktok', 'linkedin', 'x'] as const;
type Network = (typeof NETWORKS)[number];

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

async function scrape(network: Network, url: string): Promise<Stat & { error?: string }> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8', Accept: 'text/html,*/*' },
      redirect: 'follow',
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const html = (await res.text()).slice(0, 2_500_000);
    const stat = extract(network, html);
    if (stat.followers == null && stat.posts == null) return { error: 'sem dados públicos' };
    return stat;
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'falha ao acessar' };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const links = (body?.links ?? {}) as Record<string, string>;
    const entries = Object.entries(links)
      .filter(([k, v]) => (NETWORKS as readonly string[]).includes(k) && typeof v === 'string' && /^https?:\/\//i.test(v.trim()))
      .slice(0, 6);

    if (entries.length === 0) {
      return new Response(JSON.stringify({ error: 'Nenhuma URL válida enviada' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = await Promise.all(
      entries.map(async ([k, v]) => [k, await scrape(k as Network, v.trim())] as const),
    );

    return new Response(JSON.stringify({ stats: Object.fromEntries(results) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'erro' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
