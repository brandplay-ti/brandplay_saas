/**
 * `robots.txt`, `sitemap.xml` e as URLs absolutas do `index.html`, gerados no
 * build a partir de `VITE_PUBLIC_SITE_URL` (plugin `brandplay:seo`, em
 * `vite.config.ts`).
 *
 * Não são arquivos fixos em `public/` porque o domínio de cada ambiente só
 * existe como build argument do Dockploy, e o sitemap exige URL absoluta:
 *
 * - **com a variável** (só produção): o robots.txt bloqueia as áreas logadas e
 *   aponta para o sitemap;
 * - **sem ela** (homologação, local, CI): o robots.txt bloqueia tudo e não há
 *   sitemap. Homologação indexada compete com produção como conteúdo
 *   duplicado.
 *
 * No `index.html`, a URL do site torna absolutos o `canonical`, o `og:image` e
 * o `twitter:image` (prévia de link não aceita imagem relativa). Não há
 * `og:url`, de propósito: o SPA serve o mesmo HTML em toda rota, e o Facebook
 * trata o `og:url` como o endereço do link compartilhado. Fixo na landing,
 * todo link de relatório (`/r/`) ou de media kit (`/p/`) compartilhado viraria
 * a landing.
 *
 * Usado pelo `vite.config.ts`, que é empacotado antes de os aliases existirem:
 * nada aqui pode importar de `@/`.
 */

/**
 * Páginas institucionais anunciadas no sitemap.
 *
 * As páginas públicas por link ficam de fora de propósito:
 *
 * - **media kits** (`/p/:slug`): a tela de publicação promete acesso a
 *   "qualquer pessoa com o link", e não divulgação em buscador. Continuam
 *   acessíveis e rastreáveis, só não são anunciados. Suposição registrada em
 *   `docs/architecture/deployment.md` ("SEO"): anunciá-los é decisão de
 *   produto;
 * - **relatórios** (`/r/:slug`): não entram em buscador por regra de negócio
 *   (`docs/business/relatorios.md`), e a página declara `noindex`
 *   (`pages/RelatorioPublico.tsx`).
 */
export const PAGINAS_DO_SITEMAP = ["/"] as const;

/**
 * Áreas que exigem login. Rastreá-las só devolve a casca do SPA a caminho de
 * `/auth`: não há o que indexar, e o rastreio gasta orçamento do domínio.
 *
 * `/r/` **não** entra aqui, mesmo sem poder ser indexado: o buscador só lê o
 * `noindex` da página se puder rastreá-la. Bloqueado no robots.txt, um link de
 * relatório divulgado fora do portal ainda pode aparecer nos resultados, só que
 * sem conteúdo ("indexada, mas bloqueada pelo robots.txt").
 */
export const AREAS_PRIVADAS = ["/dashboard", "/admin", "/portal", "/campo", "/onboarding"] as const;

/**
 * Lê `VITE_PUBLIC_SITE_URL` e devolve a origem normalizada, sem barra no fim
 * (`https://brandplay.com.br`). Vazia ou ausente devolve `null`.
 *
 * Valor inválido para o build: um sitemap com URL errada é aceito em silêncio
 * pelo buscador, e o erro só aparece semanas depois no Search Console.
 */
export function lerSiteUrl(valor: string | undefined): string | null {
  const bruto = valor?.trim();
  if (!bruto) return null;

  let url: URL;
  try {
    url = new URL(bruto);
  } catch {
    throw new Error(
      `VITE_PUBLIC_SITE_URL inválida: "${bruto}". Use a URL completa, com o esquema: "https://${bruto}".`,
    );
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(
      `VITE_PUBLIC_SITE_URL inválida: "${bruto}". Use a URL completa, com o esquema: "https://${bruto}".`,
    );
  }

  // O portal é servido na raiz do domínio (o router não tem `basename`): um
  // caminho aqui produziria URLs que não existem.
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(
      `VITE_PUBLIC_SITE_URL deve ser só a origem do portal ("${url.origin}"), sem caminho: "${bruto}".`,
    );
  }

  return url.origin;
}

/**
 * Ambientes publicados, pelo host do Supabase que o build embute
 * (`VITE_PUBLIC_SUPABASE_URL`), e a `VITE_PUBLIC_SITE_URL` que cada um tem de
 * declarar (`null`: não declarar).
 *
 * Essa variável é a única coisa que separa produção indexada de homologação
 * bloqueada, e os dois erros passam pelo build sem nenhum sintoma: esquecida
 * em produção, o site some dos buscadores; copiada para homologação, ela passa
 * a competir com produção. Para estes hosts o build confere; fora deles
 * (local, CI) não há o que conferir.
 */
const AMBIENTES_PUBLICADOS = new Map<string, { nome: string; siteUrl: string | null }>([
  ["db.brandplay.com.br", { nome: "produção", siteUrl: "https://brandplay.com.br" }],
  ["teste.db.brandplay.com.br", { nome: "homologação", siteUrl: null }],
]);

export function conferirAmbiente(supabaseUrl: string | undefined, siteUrl: string | null): void {
  let host: string;
  try {
    host = new URL(supabaseUrl?.trim() ?? "").hostname;
  } catch {
    return;
  }

  const ambiente = AMBIENTES_PUBLICADOS.get(host);
  if (!ambiente || ambiente.siteUrl === siteUrl) return;

  const origem = `Build de ${ambiente.nome} (Supabase em ${host})`;

  if (!ambiente.siteUrl) {
    throw new Error(
      `${origem} com VITE_PUBLIC_SITE_URL="${siteUrl}". Remova a variável deste ambiente: ` +
        "só produção a declara, e com ela este ambiente seria indexado e competiria com produção.",
    );
  }

  throw new Error(
    siteUrl
      ? `${origem} com VITE_PUBLIC_SITE_URL="${siteUrl}". O valor deste ambiente é ` +
          `"${ambiente.siteUrl}": o sitemap e o canonical apontariam para outro domínio.`
      : `${origem} sem VITE_PUBLIC_SITE_URL. Declare VITE_PUBLIC_SITE_URL=${ambiente.siteUrl} ` +
          "como build argument: sem ela, o robots.txt bloqueia os buscadores e não há sitemap.",
  );
}

export function gerarRobots(siteUrl: string | null): string {
  if (!siteUrl) {
    return [
      "# Ambiente sem VITE_PUBLIC_SITE_URL: fora de produção, nada é indexado.",
      "User-agent: *",
      "Disallow: /",
      "",
    ].join("\n");
  }

  // Um único grupo `*`. Um grupo por robô (o robots.txt herdado tinha
  // Googlebot, Bingbot...) faz aquele robô ignorar as regras de `*`.
  return [
    "User-agent: *",
    ...AREAS_PRIVADAS.map((area) => `Disallow: ${area}`),
    "",
    `Sitemap: ${siteUrl}/sitemap.xml`,
    "",
  ].join("\n");
}

/**
 * Sem `lastmod`: a data do build mudaria a cada deploy, mesmo sem a página
 * mudar, e o Google passa a ignorar `lastmod` de quem não o mantém fiel.
 * `changefreq` e `priority` o Google já ignora.
 */
export function gerarSitemap(siteUrl: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...PAGINAS_DO_SITEMAP.map((pagina) => `  <url>\n    <loc>${escaparXml(siteUrl + pagina)}</loc>\n  </url>`),
    "</urlset>",
    "",
  ].join("\n");
}

function escaparXml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
