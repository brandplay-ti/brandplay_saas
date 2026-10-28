// O que `fetch-social-stats` aceita buscar, e como busca. Fica fora do
// index.ts para poder ser testado sem subir o servidor (`busca_test.ts`).
//
// A funcao roda dentro da rede Docker do Supabase self-hosted. Quando ela
// buscava qualquer http(s) recebido no corpo, um link como
// `http://kong:8000/...` ou `http://meta:8080/...` virava uma requisicao a um
// servico interno, feita de dentro da rede (SSRF). O controle agora e uma
// lista de dominios por rede social:
//
// - so https, na porta padrao, sem usuario/senha na URL;
// - o host tem de ser o dominio da rede ou um subdominio dele. IP, nome de
//   container e qualquer outro host ficam de fora por nao estarem na lista;
// - redirect e seguido a mao, e cada salto passa pela mesma checagem;
// - o https obrigatorio cobre o que sobra: mesmo que um subdominio dessas
//   redes resolvesse para um IP interno, o TLS falharia sem um certificado
//   valido para aquele nome.

export const NETWORKS = ['instagram', 'facebook', 'youtube', 'tiktok', 'linkedin', 'x'] as const;
export type Network = (typeof NETWORKS)[number];

const DOMINIOS: Record<Network, readonly string[]> = {
  instagram: ['instagram.com'],
  facebook: ['facebook.com'],
  youtube: ['youtube.com', 'youtu.be'],
  tiktok: ['tiktok.com'],
  linkedin: ['linkedin.com'],
  x: ['x.com', 'twitter.com'],
};

const MAX_URL = 2048;
export const MAX_REDIRECTS = 5;
export const MAX_BYTES = 2_500_000;
const TIMEOUT_MS = 10_000;

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';
const HEADERS = { 'User-Agent': UA, 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8', Accept: 'text/html,*/*' };

export function isNetwork(k: string): k is Network {
  return (NETWORKS as readonly string[]).includes(k);
}

/**
 * Devolve a URL normalizada se ela pode ser buscada para esta rede, ou `null`.
 *
 * `aceitarHttp` vale so para o link digitado no cadastro: o portal aceita
 * `http://` e a busca sobe para `https://` no mesmo host. Num redirect, um
 * `http://` e recusado.
 */
export function urlPermitida(network: Network, bruta: string, { aceitarHttp = false } = {}): URL | null {
  if (bruta.length > MAX_URL) return null;
  let url: URL;
  try {
    url = new URL(bruta);
  } catch {
    return null;
  }
  if (aceitarHttp && url.protocol === 'http:') url.protocol = 'https:';
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.port !== '') return null;
  const host = url.hostname;
  if (!DOMINIOS[network].some((d) => host === d || host.endsWith(`.${d}`))) return null;
  url.hash = '';
  return url;
}

type Fetch = (url: URL, init: RequestInit) => Promise<Response>;

/**
 * Busca o HTML de uma URL ja aprovada por `urlPermitida`, seguindo no maximo
 * `MAX_REDIRECTS` redirects dentro da mesma rede e lendo no maximo
 * `MAX_BYTES`. O erro devolvido e uma frase fixa: a mensagem do runtime
 * (DNS, conexao) nao volta para o cliente.
 */
export async function buscarPagina(
  network: Network,
  inicio: URL,
  { fetch: fetchFn = fetch as Fetch, timeoutMs = TIMEOUT_MS }: { fetch?: Fetch; timeoutMs?: number } = {},
): Promise<{ html: string } | { error: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let atual = inicio;
    for (let saltos = 0; ; saltos++) {
      const res = await fetchFn(atual, { headers: HEADERS, redirect: 'manual', signal: ctrl.signal });
      if (res.status >= 300 && res.status < 400) {
        await res.body?.cancel();
        const destino = res.headers.get('location');
        let proximo: URL | null = null;
        try {
          if (destino && saltos < MAX_REDIRECTS) proximo = urlPermitida(network, new URL(destino, atual).href);
        } catch {
          // Location malformado: cai no erro abaixo.
        }
        if (!proximo) return { error: 'redirecionamento não permitido' };
        atual = proximo;
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel();
        return { error: `HTTP ${res.status}` };
      }
      return { html: await lerLimitado(res, MAX_BYTES) };
    }
  } catch {
    return { error: ctrl.signal.aborted ? 'tempo esgotado' : 'falha ao acessar' };
  } finally {
    clearTimeout(timer);
  }
}

/** Le o corpo ate `max` bytes e larga o resto sem baixar. */
async function lerLimitado(res: Response, max: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let html = '';
  let lidos = 0;
  try {
    while (lidos < max) {
      const { done, value } = await reader.read();
      if (done) break;
      const parte = value.subarray(0, max - lidos);
      lidos += parte.byteLength;
      html += decoder.decode(parte, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return html + decoder.decode();
}
