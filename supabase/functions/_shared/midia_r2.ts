// Regras puras da Edge Function `midia-r2` (BP-7.05): validação do pedido,
// variantes aceitas e o XML do upload multipart do S3/R2. Sem rede nem banco,
// para os testes do `_shared` cobrirem.

/** Variantes que o navegador pode enviar hoje (D10, seção 6.4 da BP-7). */
export const VARIANTES = ["original", "analise", "miniatura", "relatorio"] as const;
export type Variante = (typeof VARIANTES)[number];

/**
 * Tipos aceitos por variante. O original é o arquivo do cliente: vale o
 * `mime_type` gravado na mídia, ou binário genérico. As outras são geradas no
 * navegador e têm formato conhecido; o servidor confere o resto na BP-7.08
 * (RNF5).
 */
const MIMES_DA_VARIANTE: Record<Exclude<Variante, "original">, readonly string[]> = {
  analise: ["video/mp4", "video/webm"],
  miniatura: ["image/jpeg", "image/webp"],
  relatorio: ["image/webp", "image/jpeg"],
};

const MIME = /^[a-z]+\/[a-z0-9.+-]{1,100}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validade das URLs (segundos). Curtas para envio; a de leitura cobre um vídeo inteiro tocando. */
export const VALIDADE_ENVIO = 15 * 60;
export const VALIDADE_LEITURA = 60 * 60;
export const VALIDADE_SERVIDOR = 5 * 60;

/** Limites do multipart do S3/R2. */
export const MAX_PARTES = 10_000;
/** Partes assinadas por chamada: o navegador pede em lotes. */
export const PARTES_POR_PEDIDO = 100;

export type PedidoMidia =
  | { acao: "iniciar"; mediaId: string; variante: Variante; mime: string | null }
  | { acao: "assinar_partes"; objetoId: string; partes: number[] }
  | { acao: "listar_partes"; objetoId: string }
  | { acao: "concluir"; objetoId: string; partes: ParteEnviada[] }
  | { acao: "abortar"; objetoId: string }
  | { acao: "ler"; mediaId: string; variante: Variante; baixar: boolean };

export type ParteEnviada = { numero: number; etag: string };

export class PedidoInvalido extends Error {}

const ehNumeroDeParte = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= MAX_PARTES;

function uuid(valor: unknown, campo: string): string {
  if (typeof valor !== "string" || !UUID.test(valor)) throw new PedidoInvalido(`${campo} inválido.`);
  return valor.toLowerCase();
}

function variante(valor: unknown): Variante {
  if (typeof valor !== "string" || !(VARIANTES as readonly string[]).includes(valor)) {
    throw new PedidoInvalido("Variante inválida.");
  }
  return valor as Variante;
}

/** ETag como o S3 devolve: entre aspas, hexadecimal (com sufixo `-N` no multipart). */
export function normalizarEtag(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim().replace(/^"|"$/g, "");
  if (!/^[0-9a-fA-F]{1,64}(-\d{1,5})?$/.test(limpo)) return null;
  return `"${limpo.toLowerCase()}"`;
}

/** Lê e valida o corpo da requisição. Nunca aceita organização, caminho nem tamanho. */
export function lerPedido(corpo: unknown): PedidoMidia {
  if (!corpo || typeof corpo !== "object") throw new PedidoInvalido("Corpo inválido.");
  const c = corpo as Record<string, unknown>;
  switch (c.acao) {
    case "iniciar": {
      const mime = c.mime === undefined || c.mime === null ? null : c.mime;
      if (mime !== null && (typeof mime !== "string" || !MIME.test(mime))) throw new PedidoInvalido("Tipo de arquivo inválido.");
      return { acao: "iniciar", mediaId: uuid(c.media_id, "media_id"), variante: variante(c.variante), mime };
    }
    case "assinar_partes": {
      const partes = c.partes;
      if (!Array.isArray(partes) || partes.length === 0 || partes.length > PARTES_POR_PEDIDO) {
        throw new PedidoInvalido(`Peça de 1 a ${PARTES_POR_PEDIDO} partes por vez.`);
      }
      if (!partes.every(ehNumeroDeParte)) throw new PedidoInvalido(`Número de parte fora de 1 a ${MAX_PARTES}.`);
      return { acao: "assinar_partes", objetoId: uuid(c.objeto_id, "objeto_id"), partes: [...new Set(partes)].sort((a, b) => a - b) };
    }
    case "listar_partes":
      return { acao: "listar_partes", objetoId: uuid(c.objeto_id, "objeto_id") };
    case "concluir": {
      const partes = c.partes;
      if (!Array.isArray(partes) || partes.length === 0 || partes.length > MAX_PARTES) {
        throw new PedidoInvalido("Lista de partes inválida.");
      }
      const lidas: ParteEnviada[] = [];
      for (const p of partes) {
        const numero = (p as Record<string, unknown> | null)?.numero;
        const etag = normalizarEtag((p as Record<string, unknown> | null)?.etag);
        if (!ehNumeroDeParte(numero) || !etag) throw new PedidoInvalido("Parte com número ou ETag inválido.");
        lidas.push({ numero, etag });
      }
      lidas.sort((a, b) => a.numero - b.numero);
      for (let i = 1; i < lidas.length; i++) {
        if (lidas[i].numero === lidas[i - 1].numero) throw new PedidoInvalido("Parte repetida.");
      }
      return { acao: "concluir", objetoId: uuid(c.objeto_id, "objeto_id"), partes: lidas };
    }
    case "abortar":
      return { acao: "abortar", objetoId: uuid(c.objeto_id, "objeto_id") };
    case "ler":
      if (c.baixar !== undefined && typeof c.baixar !== "boolean") throw new PedidoInvalido("baixar inválido.");
      return { acao: "ler", mediaId: uuid(c.media_id, "media_id"), variante: variante(c.variante), baixar: c.baixar === true };
    default:
      throw new PedidoInvalido("Ação inválida.");
  }
}

/**
 * Tipo do objeto que vai para o R2. Original: o da mídia (gravado pelo
 * cliente ao criar a linha) ou binário genérico. Demais variantes: só os da
 * lista, e o pedido precisa dizer qual.
 */
export function mimeDoObjeto(v: Variante, mimeDaMidia: string | null, mimePedido: string | null): string {
  if (v === "original") return mimeDaMidia && MIME.test(mimeDaMidia) ? mimeDaMidia : "application/octet-stream";
  const aceitos = MIMES_DA_VARIANTE[v];
  if (!mimePedido || !aceitos.includes(mimePedido)) {
    throw new PedidoInvalido(`Tipo da variante ${v} deve ser ${aceitos.join(" ou ")}.`);
  }
  return mimePedido;
}

const escaparXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Corpo do CompleteMultipartUpload, com as partes em ordem. */
export function xmlDeConclusao(partes: ParteEnviada[]): string {
  const itens = partes
    .map((p) => `<Part><PartNumber>${p.numero}</PartNumber><ETag>${escaparXml(p.etag)}</ETag></Part>`)
    .join("");
  return `<CompleteMultipartUpload xmlns="http://s3.amazonaws.com/doc/2006-03-01/">${itens}</CompleteMultipartUpload>`;
}

function tag(xml: string, nome: string): string | null {
  const m = xml.match(new RegExp(`<${nome}>([\\s\\S]*?)</${nome}>`));
  return m ? m[1] : null;
}

const desescaparXml = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** UploadId da resposta do CreateMultipartUpload. */
export function lerUploadId(xml: string): string | null {
  const id = tag(xml, "UploadId");
  return id ? desescaparXml(id.trim()) : null;
}

/**
 * O S3 pode responder 200 ao CompleteMultipartUpload com um `<Error>` no
 * corpo. Devolve o código do erro, ou `null` se não houver.
 */
export function erroNoXml(xml: string): string | null {
  if (!/<Error>/.test(xml)) return null;
  return tag(xml, "Code") ?? "Erro";
}

export type PaginaDePartes = {
  partes: Array<{ numero: number; etag: string; tamanho: number }>;
  proximoMarcador: number | null;
};

/** Uma página do ListParts. */
export function lerPartes(xml: string): PaginaDePartes {
  const partes: PaginaDePartes["partes"] = [];
  for (const m of xml.matchAll(/<Part>([\s\S]*?)<\/Part>/g)) {
    const numero = Number(tag(m[1], "PartNumber"));
    const etag = normalizarEtag(desescaparXml(tag(m[1], "ETag") ?? ""));
    const tamanho = Number(tag(m[1], "Size"));
    if (ehNumeroDeParte(numero) && etag && Number.isFinite(tamanho)) partes.push({ numero, etag, tamanho });
  }
  const truncado = tag(xml, "IsTruncated")?.trim() === "true";
  const marcador = Number(tag(xml, "NextPartNumberMarker"));
  return { partes, proximoMarcador: truncado && Number.isInteger(marcador) && marcador > 0 ? marcador : null };
}
