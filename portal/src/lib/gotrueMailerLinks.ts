/** Assuntos versionados no serviço `auth` (`docker/supabase/docker-compose.yml`). */
export const GOTRUE_MAILER_SUBJECTS = {
  recuperacao: "Redefina sua senha do Brandplay",
  confirmacao: "Confirme seu e-mail no Brandplay",
  convite: "Você foi convidado para o Brandplay",
  trocaDeEmail: "Confirme a troca de e-mail no Brandplay",
  linkDeAcesso: "Seu link de acesso ao Brandplay",
  reautenticacao: "Seu código de confirmação do Brandplay",
} as const;

const supabasePublicUrlDefault = "http://localhost:8010";

/** Base pública do Kong (links `/auth/v1/*` nos e-mails). E2E pode sobrescrever via env. */
export function baseUrlSupabasePublica(env: NodeJS.ProcessEnv = process.env): string {
  return (env.E2E_SUPABASE_URL ?? env.VITE_PUBLIC_SUPABASE_URL ?? supabasePublicUrlDefault).replace(/\/$/, "");
}

/** GoTrue às vezes gera `http://localhost/auth/...` quando `API_EXTERNAL_URL` omite a porta do Kong. */
export function normalizarLinkApiGotrue(link: string, baseUrl = baseUrlSupabasePublica()): string {
  try {
    const alvo = new URL(link);
    if (!alvo.pathname.includes("/auth/v1/")) return link;
    const base = new URL(baseUrl);
    alvo.protocol = base.protocol;
    alvo.hostname = base.hostname;
    alvo.port = base.port;
    return alvo.toString();
  } catch {
    return link;
  }
}

export function linkDeVerificacaoGotrue(html: string, text: string, baseUrl?: string): string | undefined {
  const bruto =
    html.match(/href="([^"]*\/auth\/v1\/verify[^"]*)"/)?.[1] ?? text.match(/https?:\/\/\S*\/auth\/v1\/verify\S*/)?.[0];
  return bruto ? normalizarLinkApiGotrue(bruto.replace(/&amp;/g, "&"), baseUrl) : undefined;
}
