// Testes das regras de `busca.ts`. Nao acessam rede: o fetch e falso. Rodam no
// job `funcoes` do CI; localmente:
//
//   docker run --rm -v "<repo>/supabase/functions:/fn:ro" -w /fn denoland/deno:2.1.4 \
//     deno test fetch-social-stats/busca_test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buscarPagina, MAX_BYTES, MAX_REDIRECTS, type Network, urlPermitida } from './busca.ts';

const permitida = (network: Network, url: string, aceitarHttp = false) =>
  urlPermitida(network, url, { aceitarHttp })?.href ?? null;

Deno.test('aceita o dominio da rede e subdominios dele', () => {
  assertEquals(permitida('instagram', 'https://instagram.com/marca'), 'https://instagram.com/marca');
  assertEquals(permitida('instagram', 'https://www.instagram.com/marca/'), 'https://www.instagram.com/marca/');
  assertEquals(permitida('facebook', 'https://m.facebook.com/marca'), 'https://m.facebook.com/marca');
  assertEquals(permitida('youtube', 'https://youtube.com/@marca'), 'https://youtube.com/@marca');
  assertEquals(permitida('youtube', 'https://youtu.be/abc'), 'https://youtu.be/abc');
  assertEquals(permitida('tiktok', 'https://www.tiktok.com/@marca'), 'https://www.tiktok.com/@marca');
  assertEquals(permitida('linkedin', 'https://br.linkedin.com/company/marca'), 'https://br.linkedin.com/company/marca');
  assertEquals(permitida('x', 'https://x.com/marca'), 'https://x.com/marca');
  assertEquals(permitida('x', 'https://twitter.com/marca'), 'https://twitter.com/marca');
  assertEquals(permitida('instagram', 'https://INSTAGRAM.com/marca#topo'), 'https://instagram.com/marca');
  assertEquals(permitida('instagram', 'https://instagram.com:443/marca'), 'https://instagram.com/marca');
});

Deno.test('http digitado no cadastro sobe para https; sem a opcao, e recusado', () => {
  assertEquals(permitida('instagram', 'http://instagram.com/marca', true), 'https://instagram.com/marca');
  assertEquals(permitida('instagram', 'http://instagram.com/marca'), null);
  assertEquals(permitida('instagram', 'http://instagram.com:8080/marca', true), null);
});

Deno.test('recusa servicos internos, IPs e hosts fora da lista', () => {
  const recusadas = [
    'http://kong:8000/rest/v1/',
    'https://kong:8000/',
    'https://meta/',
    'https://db:5432/',
    'https://localhost/',
    'https://127.0.0.1/',
    'https://2130706433/',
    'https://[::1]/',
    'https://169.254.169.254/latest/meta-data/',
    'https://evilinstagram.com/',
    'https://instagram.com.evil.com/',
    'https://instagram.com./marca',
    'https://instagram.com:8443/marca',
    'https://usuario:senha@instagram.com/marca',
    'file:///etc/passwd',
    'ftp://instagram.com/marca',
    'instagram.com/marca',
    'nao e url',
    `https://instagram.com/${'a'.repeat(2048)}`,
  ];
  for (const url of recusadas) assertEquals(permitida('instagram', url, true), null, url);
});

Deno.test('o host tem de ser da rede declarada, nao de outra', () => {
  assertEquals(permitida('instagram', 'https://youtube.com/@marca'), null);
  assertEquals(permitida('x', 'https://facebook.com/marca'), null);
});

type Chamada = { url: string; redirect?: RequestRedirect };

function fetchFalso(respostas: Record<string, () => Response>) {
  const chamadas: Chamada[] = [];
  const fetch = (url: URL, init: RequestInit) => {
    chamadas.push({ url: url.href, redirect: init.redirect });
    const resposta = respostas[url.href];
    return Promise.resolve(resposta ? resposta() : new Response('nao encontrado', { status: 404 }));
  };
  return { fetch, chamadas };
}

const redirect = (location: string, status = 301) => () => new Response(null, { status, headers: { location } });
const inicio = (url: string) => urlPermitida('instagram', url)!;

Deno.test('segue redirect dentro da rede, sempre com redirect manual', async () => {
  const { fetch, chamadas } = fetchFalso({
    'https://instagram.com/marca': redirect('https://www.instagram.com/marca/'),
    'https://www.instagram.com/marca/': redirect('/accounts/login/', 302),
    'https://www.instagram.com/accounts/login/': () => new Response('<html>ok</html>'),
  });
  const r = await buscarPagina('instagram', inicio('https://instagram.com/marca'), { fetch });
  assertEquals(r, { html: '<html>ok</html>' });
  assertEquals(chamadas.map((c) => c.url), [
    'https://instagram.com/marca',
    'https://www.instagram.com/marca/',
    'https://www.instagram.com/accounts/login/',
  ]);
  assertEquals(chamadas.every((c) => c.redirect === 'manual'), true);
});

Deno.test('recusa redirect para servico interno, outro host ou http', async () => {
  for (const destino of ['http://kong:8000/', 'https://evil.com/', 'http://www.instagram.com/marca', 'https://127.0.0.1/']) {
    const { fetch, chamadas } = fetchFalso({ 'https://instagram.com/marca': redirect(destino) });
    const r = await buscarPagina('instagram', inicio('https://instagram.com/marca'), { fetch });
    assertEquals(r, { error: 'redirecionamento não permitido' }, destino);
    assertEquals(chamadas.length, 1, destino);
  }
});

Deno.test('redirect sem Location tambem e recusado', async () => {
  const { fetch } = fetchFalso({ 'https://instagram.com/marca': () => new Response(null, { status: 302 }) });
  const r = await buscarPagina('instagram', inicio('https://instagram.com/marca'), { fetch });
  assertEquals(r, { error: 'redirecionamento não permitido' });
});

Deno.test('para depois de MAX_REDIRECTS saltos', async () => {
  const { fetch, chamadas } = fetchFalso({
    'https://instagram.com/a': redirect('https://instagram.com/b'),
    'https://instagram.com/b': redirect('https://instagram.com/a'),
  });
  const r = await buscarPagina('instagram', inicio('https://instagram.com/a'), { fetch });
  assertEquals(r, { error: 'redirecionamento não permitido' });
  assertEquals(chamadas.length, MAX_REDIRECTS + 1);
});

Deno.test('le no maximo MAX_BYTES e cancela o resto', async () => {
  let cancelado = false;
  const bloco = new TextEncoder().encode('a'.repeat(64 * 1024));
  const corpoSemFim = new ReadableStream<Uint8Array>({
    pull: (c) => c.enqueue(bloco),
    cancel: () => {
      cancelado = true;
    },
  });
  const { fetch } = fetchFalso({ 'https://instagram.com/marca': () => new Response(corpoSemFim) });
  const r = await buscarPagina('instagram', inicio('https://instagram.com/marca'), { fetch });
  assertEquals('html' in r ? r.html.length : -1, MAX_BYTES);
  assertEquals(cancelado, true);
});

Deno.test('erro HTTP e falha de rede voltam como frase fixa', async () => {
  const { fetch } = fetchFalso({});
  assertEquals(await buscarPagina('instagram', inicio('https://instagram.com/marca'), { fetch }), { error: 'HTTP 404' });

  const falha = () => Promise.reject(new TypeError('dns error: failed to lookup address information'));
  assertEquals(await buscarPagina('instagram', inicio('https://instagram.com/marca'), { fetch: falha }), {
    error: 'falha ao acessar',
  });
});

Deno.test('respeita o timeout', async () => {
  const pendurado = (_url: URL, init: RequestInit) =>
    new Promise<Response>((_, rejeitar) => init.signal?.addEventListener('abort', () => rejeitar(init.signal?.reason)));
  const r = await buscarPagina('instagram', inicio('https://instagram.com/marca'), { fetch: pendurado, timeoutMs: 20 });
  assertEquals(r, { error: 'tempo esgotado' });
});
