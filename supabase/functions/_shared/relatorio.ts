// Regras puras do relatório em landing page (0040, ADR-0011): endereço de
// arquivo, identificação de link de rede social e leitura da API do YouTube.
// Sem rede nem banco, para o `deno test` do CI. O mesmo contrato de link vale
// no portal (`portal/src/lib/redesSociais.ts`).

export const SLUG_RELATORIO = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function slugValido(valor: unknown): valor is string {
  return typeof valor === "string" && valor.length >= 3 && valor.length <= 80 && SLUG_RELATORIO.test(valor);
}

/** Buckets cujo arquivo a página pode mostrar por URL pública. */
export const BUCKETS_PUBLICOS = ["property-media", "sponsor-logos", "org-logos"] as const;
export type BucketPublico = (typeof BUCKETS_PUBLICOS)[number];

function caminhoCodificado(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/**
 * URL pública de um arquivo. Com `largura`, passa pelo imgproxy do stack
 * (`/render/image`), que devolve a imagem redimensionada.
 */
export function urlPublica(base: string, bucket: BucketPublico, path: string, largura?: number): string {
  const raiz = base.replace(/\/+$/, "");
  const p = caminhoCodificado(path.replace(/^\/+/, ""));
  if (largura) {
    return `${raiz}/storage/v1/render/image/public/${bucket}/${p}?width=${largura}&quality=75&resize=contain`;
  }
  return `${raiz}/storage/v1/object/public/${bucket}/${p}`;
}

/**
 * A URL assinada sai com a origem interna (`http://kong:8000`), que o
 * navegador não alcança. Troca pela origem pública do ambiente.
 */
export function comOrigemPublica(url: string, base: string): string {
  const interna = new URL(url);
  const publica = new URL(base);
  const prefixo = publica.pathname.replace(/\/+$/, "");
  return `${publica.origin}${prefixo}${interna.pathname}${interna.search}`;
}

// ─── Links de rede social ───────────────────────────────────────────────────

export type Rede = "instagram" | "youtube" | "tiktok" | "facebook" | "x" | "linkedin" | "site";

export interface LinkIdentificado {
  rede: Rede;
  /** id do vídeo (YouTube, TikTok) ou código da publicação (Instagram). */
  idExterno: string | null;
  url: string;
}

const DOMINIOS: [Rede, string[]][] = [
  ["youtube", ["youtube.com", "youtu.be", "youtube-nocookie.com"]],
  ["instagram", ["instagram.com"]],
  ["tiktok", ["tiktok.com"]],
  ["facebook", ["facebook.com", "fb.watch"]],
  ["x", ["x.com", "twitter.com"]],
  ["linkedin", ["linkedin.com"]],
];

const ID_YOUTUBE = /^[A-Za-z0-9_-]{11}$/;

/** Rede e id de um link `https`. Link de outro domínio é `site`. */
export function identificarLink(bruta: string): LinkIdentificado | null {
  let url: URL;
  try {
    url = new URL(bruta.trim());
  } catch {
    return null;
  }
  if (url.protocol === "http:") url.protocol = "https:";
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  const rede =
    DOMINIOS.find(([, dominios]) => dominios.some((d) => host === d || host.endsWith(`.${d}`)))?.[0] ?? "site";
  const partes = url.pathname.split("/").filter(Boolean);
  let idExterno: string | null = null;

  if (rede === "youtube") {
    const candidato =
      host === "youtu.be" || host.endsWith(".youtu.be")
        ? partes[0]
        : url.searchParams.get("v") ??
          (["shorts", "live", "embed"].includes(partes[0] ?? "") ? partes[1] : undefined);
    idExterno = candidato && ID_YOUTUBE.test(candidato) ? candidato : null;
  } else if (rede === "instagram") {
    const i = partes.findIndex((p) => ["p", "reel", "reels", "tv"].includes(p));
    const codigo = i >= 0 ? partes[i + 1] : undefined;
    idExterno = codigo && /^[A-Za-z0-9_-]{5,64}$/.test(codigo) ? codigo : null;
  } else if (rede === "tiktok") {
    const i = partes.findIndex((p) => p === "video" || p === "photo");
    const id = i >= 0 ? partes[i + 1] : undefined;
    idExterno = id && /^\d{5,30}$/.test(id) ? id : null;
  }

  url.hash = "";
  return { rede, idExterno, url: url.toString() };
}

// ─── API do YouTube ─────────────────────────────────────────────────────────

/** Intervalo mínimo entre duas buscas de métricas do mesmo post. */
export const CACHE_METRICAS_MS = 60 * 60 * 1000;

export function precisaAtualizar(checadoEm: string | null, agora: number): boolean {
  if (!checadoEm) return true;
  const t = Date.parse(checadoEm);
  return !Number.isFinite(t) || agora - t >= CACHE_METRICAS_MS;
}

export function emLotes<T>(itens: T[], tamanho = 50): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

export interface MetricasYoutube {
  views: number | null;
  likes: number | null;
  comentarios: number | null;
  titulo: string | null;
  publicadoEm: string | null;
}

/** `videos.list` só com os campos usados: 1 unidade de cota por até 50 ids. */
export function urlVideosYoutube(ids: string[], chave: string): string {
  const q = new URLSearchParams({
    part: "statistics,snippet",
    id: ids.join(","),
    fields: "items(id,snippet(title,publishedAt),statistics(viewCount,likeCount,commentCount))",
    key: chave,
  });
  return `https://www.googleapis.com/youtube/v3/videos?${q}`;
}

function contagem(valor: unknown): number | null {
  if (typeof valor !== "string" && typeof valor !== "number") return null;
  const n = Number(valor);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

/** Lê a resposta de `videos.list`. Item fora do formato é ignorado. */
export function lerVideosYoutube(corpo: unknown): Map<string, MetricasYoutube> {
  const saida = new Map<string, MetricasYoutube>();
  const itens = (corpo as { items?: unknown })?.items;
  if (!Array.isArray(itens)) return saida;
  for (const item of itens) {
    const id = (item as { id?: unknown })?.id;
    if (typeof id !== "string" || !ID_YOUTUBE.test(id)) continue;
    const st = (item as { statistics?: Record<string, unknown> }).statistics ?? {};
    const sn = (item as { snippet?: Record<string, unknown> }).snippet ?? {};
    const titulo = typeof sn.title === "string" ? sn.title.slice(0, 200) : null;
    const publicado = typeof sn.publishedAt === "string" && /^\d{4}-\d{2}-\d{2}/.test(sn.publishedAt)
      ? sn.publishedAt.slice(0, 10)
      : null;
    saida.set(id, {
      views: contagem(st.viewCount),
      likes: contagem(st.likeCount),
      comentarios: contagem(st.commentCount),
      titulo,
      publicadoEm: publicado,
    });
  }
  return saida;
}

/**
 * oEmbed público (sem chave) para preencher título e miniatura no cadastro.
 * O host é fixo: o link do usuário vai só como parâmetro, então não há como
 * apontar a busca para um serviço interno.
 */
export function urlOembed(link: LinkIdentificado): string | null {
  if (link.rede === "youtube" && link.idExterno) {
    const alvo = `https://www.youtube.com/watch?v=${link.idExterno}`;
    return `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(alvo)}`;
  }
  if (link.rede === "tiktok" && link.idExterno) {
    return `https://www.tiktok.com/oembed?url=${encodeURIComponent(link.url)}`;
  }
  return null;
}

export interface Oembed {
  titulo: string | null;
  autor: string | null;
  miniatura: string | null;
}

export function lerOembed(corpo: unknown): Oembed {
  const c = (corpo ?? {}) as Record<string, unknown>;
  const texto = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const mini = texto(c.thumbnail_url, 2048);
  return {
    titulo: texto(c.title, 200),
    autor: texto(c.author_name, 120),
    miniatura: mini && mini.startsWith("https://") ? mini : null,
  };
}
