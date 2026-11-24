// Assinatura AWS SigV4 por query string (URL pré-assinada) para o S3 do
// Cloudflare R2 (BP-7.05) e, em desenvolvimento, do MinIO local. Sem
// dependência externa: WebCrypto do próprio Deno.
//
// A mesma assinatura serve às duas pontas:
//   - o navegador recebe URLs de PUT (partes do multipart) e GET (leitura);
//   - a Edge Function chama a API (criar, listar, concluir e abortar
//     multipart, HEAD do objeto) com URLs assinadas para o endpoint interno.
//
// Só o header `host` entra na assinatura e o corpo vai como UNSIGNED-PAYLOAD:
// é o formato que o R2 aceita em URL pré-assinada.

export type ConfigS3 = {
  /** Endpoint usado pelo servidor, ex.: https://<conta>.r2.cloudflarestorage.com */
  endpoint: string;
  /** Endpoint que vai nas URLs entregues ao navegador. Igual ao `endpoint` no R2. */
  endpointPublico: string;
  /** `auto` no R2; a região configurada no MinIO (us-east-1). */
  regiao: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

const encoder = new TextEncoder();

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(texto: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(texto)));
}

async function hmac(chave: ArrayBuffer | Uint8Array, texto: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", chave, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, encoder.encode(texto));
}

/** RFC 3986, como o SigV4 exige: tudo codificado menos A-Z a-z 0-9 - _ . ~ */
export function codificar(valor: string): string {
  return encodeURIComponent(valor).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** Caminho do objeto codificado segmento a segmento, preservando as barras. */
export function codificarCaminho(caminho: string): string {
  return caminho.split("/").map(codificar).join("/");
}

function dataAmz(agora: Date): { dataHora: string; data: string } {
  const iso = agora.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return { dataHora: iso, data: iso.slice(0, 8) };
}

export type AssinaturaQuery = {
  metodo: string;
  /** Host com porta, se houver: `localhost:9010`, `conta.r2.cloudflarestorage.com`. */
  host: string;
  /** Caminho já codificado, começando com `/`. */
  caminho: string;
  /** Parâmetros além dos X-Amz-* (partNumber, uploadId, uploads). */
  query?: Record<string, string>;
  regiao: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiraEmSegundos: number;
  agora?: Date;
};

/**
 * Query string assinada (SigV4, serviço `s3`), já com `X-Amz-Signature`.
 * Testada contra o exemplo de URL pré-assinada da documentação da AWS.
 */
export async function assinarQuery(p: AssinaturaQuery): Promise<string> {
  if (!Number.isInteger(p.expiraEmSegundos) || p.expiraEmSegundos < 1 || p.expiraEmSegundos > 604_800) {
    throw new Error("Validade da URL fora de 1 s a 7 dias");
  }
  const { dataHora, data } = dataAmz(p.agora ?? new Date());
  const escopo = `${data}/${p.regiao}/s3/aws4_request`;
  const params: Record<string, string> = {
    ...(p.query ?? {}),
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${p.accessKeyId}/${escopo}`,
    "X-Amz-Date": dataHora,
    "X-Amz-Expires": String(p.expiraEmSegundos),
    "X-Amz-SignedHeaders": "host",
  };
  const queryCanonica = Object.keys(params)
    .map((k) => [codificar(k), codificar(params[k])] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const requisicaoCanonica = [
    p.metodo.toUpperCase(),
    p.caminho,
    queryCanonica,
    `host:${p.host}`,
    "",
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const paraAssinar = ["AWS4-HMAC-SHA256", dataHora, escopo, await sha256Hex(requisicaoCanonica)].join("\n");

  const kData = await hmac(encoder.encode(`AWS4${p.secretAccessKey}`), data);
  const kRegiao = await hmac(kData, p.regiao);
  const kServico = await hmac(kRegiao, "s3");
  const kAssinatura = await hmac(kServico, "aws4_request");
  const assinatura = hex(await hmac(kAssinatura, paraAssinar));

  return `${queryCanonica}&X-Amz-Signature=${assinatura}`;
}

export type OperacaoS3 = {
  metodo: "GET" | "PUT" | "POST" | "DELETE" | "HEAD";
  /** Chave do objeto no bucket (sem barra inicial). */
  chave: string;
  query?: Record<string, string>;
  expiraEmSegundos: number;
  /** `true` para a URL que vai ao navegador; `false` para a chamada do servidor. */
  publica: boolean;
  agora?: Date;
};

/** URL pré-assinada em estilo de caminho: <endpoint>/<bucket>/<chave>?... */
export async function urlAssinada(cfg: ConfigS3, op: OperacaoS3): Promise<string> {
  if (!op.chave || op.chave.startsWith("/") || op.chave.includes("..")) {
    throw new Error("Chave de objeto inválida");
  }
  const base = new URL(op.publica ? cfg.endpointPublico : cfg.endpoint);
  const prefixo = base.pathname.replace(/\/+$/, "");
  const caminho = `${prefixo}/${codificar(cfg.bucket)}/${codificarCaminho(op.chave)}`;
  const query = await assinarQuery({
    metodo: op.metodo,
    host: base.host,
    caminho,
    query: op.query,
    regiao: cfg.regiao,
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    expiraEmSegundos: op.expiraEmSegundos,
    agora: op.agora,
  });
  return `${base.protocol}//${base.host}${caminho}?${query}`;
}

/**
 * Configuração a partir do ambiente. Sem conta, chave ou bucket, devolve
 * `null`: a função responde "armazenamento não configurado" em vez de
 * assinar algo que o R2 vai recusar.
 *
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *   R2_ENDPOINT          opcional; padrão https://<conta>.r2.cloudflarestorage.com
 *   R2_PUBLIC_ENDPOINT   opcional; padrão = R2_ENDPOINT (só difere no MinIO local)
 *   R2_REGION            opcional; padrão `auto`
 */
export function configDoAmbiente(env: (nome: string) => string | undefined): ConfigS3 | null {
  const conta = env("R2_ACCOUNT_ID")?.trim();
  const accessKeyId = env("R2_ACCESS_KEY_ID")?.trim();
  const secretAccessKey = env("R2_SECRET_ACCESS_KEY")?.trim();
  const bucket = env("R2_BUCKET")?.trim();
  const endpointExplicito = env("R2_ENDPOINT")?.trim();
  if (!accessKeyId || !secretAccessKey || !bucket || (!conta && !endpointExplicito)) return null;

  const endpoint = endpointExplicito || `https://${conta}.r2.cloudflarestorage.com`;
  const endpointPublico = env("R2_PUBLIC_ENDPOINT")?.trim() || endpoint;
  for (const url of [endpoint, endpointPublico]) {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  }
  return {
    endpoint,
    endpointPublico,
    regiao: env("R2_REGION")?.trim() || "auto",
    bucket,
    accessKeyId,
    secretAccessKey,
  };
}
