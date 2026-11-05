// Links de redes sociais do relatório (ADR-0011): identificar rede e id a
// partir da URL colada e montar embed e miniatura a partir do id, nunca da
// URL crua. O mesmo contrato vale na Edge Function
// (`supabase/functions/_shared/relatorio.ts`).

export type Rede = "instagram" | "youtube" | "tiktok" | "facebook" | "x" | "linkedin" | "site";
export type TipoDePost = "post" | "reel" | "video" | "story" | "live" | "materia" | "link";

export const REDES: { key: Rede; label: string }[] = [
  { key: "instagram", label: "Instagram" },
  { key: "youtube", label: "YouTube" },
  { key: "tiktok", label: "TikTok" },
  { key: "facebook", label: "Facebook" },
  { key: "x", label: "X" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "site", label: "Site ou imprensa" },
];

export const TIPOS_DE_POST: { key: TipoDePost; label: string }[] = [
  { key: "post", label: "Post" },
  { key: "reel", label: "Reel / vídeo curto" },
  { key: "video", label: "Vídeo" },
  { key: "live", label: "Transmissão" },
  { key: "story", label: "Story" },
  { key: "materia", label: "Matéria de imprensa" },
  { key: "link", label: "Outro link" },
];

export const rotuloDaRede = (rede: string) => REDES.find((r) => r.key === rede)?.label ?? rede;
export const rotuloDoTipo = (tipo: string) => TIPOS_DE_POST.find((t) => t.key === tipo)?.label ?? tipo;

export interface LinkIdentificado {
  rede: Rede;
  idExterno: string | null;
  tipo: TipoDePost;
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
/** O mesmo formato que o banco aceita em `property_posts.external_id`. */
const ID_SEGURO = /^[A-Za-z0-9_-]{1,64}$/;

/** Rede, id e tipo provável de um link. `http` sobe para `https`; o resto é recusado. */
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
  let tipo: TipoDePost = "post";

  if (rede === "youtube") {
    const curto = host === "youtu.be" || host.endsWith(".youtu.be");
    const candidato = curto
      ? partes[0]
      : url.searchParams.get("v") ?? (["shorts", "live", "embed"].includes(partes[0] ?? "") ? partes[1] : undefined);
    idExterno = candidato && ID_YOUTUBE.test(candidato) ? candidato : null;
    tipo = partes[0] === "shorts" ? "reel" : partes[0] === "live" ? "live" : "video";
  } else if (rede === "instagram") {
    const i = partes.findIndex((p) => ["p", "reel", "reels", "tv"].includes(p));
    const codigo = i >= 0 ? partes[i + 1] : undefined;
    idExterno = codigo && /^[A-Za-z0-9_-]{5,64}$/.test(codigo) ? codigo : null;
    tipo = i >= 0 && partes[i] !== "p" ? "reel" : "post";
  } else if (rede === "tiktok") {
    const i = partes.findIndex((p) => p === "video" || p === "photo");
    const id = i >= 0 ? partes[i + 1] : undefined;
    idExterno = id && /^\d{5,30}$/.test(id) ? id : null;
    tipo = "reel";
  } else if (rede === "facebook") {
    tipo = /\/(videos|reel|watch)\b/.test(url.pathname) || host === "fb.watch" ? "video" : "post";
  } else if (rede === "site") {
    tipo = "materia";
  }

  url.hash = "";
  return { rede, idExterno, tipo, url: url.toString() };
}

export interface PostParaEmbed {
  rede: string;
  tipo: string;
  id_externo: string | null;
  url: string;
}

/**
 * Endereço do iframe. YouTube pelo domínio sem cookies, como nos exemplos de
 * referência. Rede sem embed (X, LinkedIn, site) devolve `null`: vira cartão
 * com link.
 */
export function urlDeEmbed(post: PostParaEmbed): string | null {
  const id = post.id_externo && ID_SEGURO.test(post.id_externo) ? post.id_externo : null;
  if (post.rede === "youtube" && id) {
    return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&autoplay=1`;
  }
  if (post.rede === "instagram" && id) {
    return `https://www.instagram.com/${post.tipo === "reel" ? "reel" : "p"}/${id}/embed/`;
  }
  if (post.rede === "tiktok" && id) return `https://www.tiktok.com/embed/v2/${id}`;
  if (post.rede === "facebook" && identificarLink(post.url)?.rede === "facebook") {
    const plugin = post.tipo === "video" || post.tipo === "reel" || post.tipo === "live" ? "video" : "post";
    return `https://www.facebook.com/plugins/${plugin}.php?href=${encodeURIComponent(post.url)}&show_text=false`;
  }
  return null;
}

/** Miniatura sem chamar a rede: só o YouTube tem endereço previsível. */
export function miniaturaDoPost(post: Pick<PostParaEmbed, "rede" | "id_externo">): string | null {
  if (post.rede === "youtube" && post.id_externo && ID_YOUTUBE.test(post.id_externo)) {
    return `https://i.ytimg.com/vi/${post.id_externo}/hqdefault.jpg`;
  }
  return null;
}

/** Proporção do quadro do embed. */
export function proporcaoDoEmbed(post: Pick<PostParaEmbed, "rede" | "tipo">): "16/9" | "9/16" | "4/5" {
  if (post.rede === "youtube" && post.tipo !== "reel") return "16/9";
  if (post.rede === "facebook" && post.tipo === "video") return "16/9";
  if (post.tipo === "reel" || post.rede === "tiktok") return "9/16";
  return "4/5";
}
