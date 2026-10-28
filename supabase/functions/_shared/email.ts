// Envio de e-mail transacional das Edge Functions (ADR-0008, fase F; mesmo
// padrão da ADR-0005 do central-check).
//
// A regra de negócio fala com `sendEmail`, nunca com o provedor. Hoje o
// provedor é o Resend; trocar de provedor é escrever outro adaptador aqui.
//
// Configuração (variáveis do serviço `functions`, nunca `VITE_*`):
//
//   RESEND_API_KEY      chave do Resend. Vazia = envio desligado: a operação
//                       segue e o resultado diz `nao_configurado`.
//   EMAIL_FROM          remetente completo, ex.: "Brandplay <nao-responda@brandplay.com.br>".
//   RESEND_FROM_DOMAIN  sem EMAIL_FROM, monta "Brandplay <nao-responda@<domínio>>".
//                       Sem os dois, cai no remetente de teste do Resend, que
//                       só entrega para o dono da conta.
//   APP_URL             base dos links que saem por e-mail (`appUrl()`); vazia,
//                       usa SITE_URL.
//
// Falha de envio NUNCA quebra a operação que o disparou (o convite já foi
// gravado, a notificação já existe): é registrada no log, sem a chave e sem o
// corpo do e-mail, e devolvida para quem chamou decidir o que mostrar.

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  /** Quem recebe a resposta, quando não deve ser o remetente. */
  replyTo?: string;
}

export interface EmailResult {
  sent: boolean;
  id?: string;
  reason?: "nao_configurado" | "erro_do_provedor" | "falha_de_rede";
}

/** Adaptador de um provedor de e-mail. */
export interface EmailProvider {
  send(message: EmailMessage & { from: string }): Promise<EmailResult>;
}

const REMETENTE_DE_TESTE = "Brandplay <onboarding@resend.dev>";

/** Lê uma variável de ambiente; `env` é injetável para teste. */
type Env = (nome: string) => string | undefined;
const envDoDeno: Env = (nome) => Deno.env.get(nome);

export function resendProvider(apiKey: string, fetcher: typeof fetch = fetch): EmailProvider {
  return {
    async send({ from, to, subject, html, replyTo }) {
      let resposta: Response;
      try {
        resposta = await fetcher("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from,
            to: Array.isArray(to) ? to : [to],
            subject,
            html,
            ...(replyTo ? { reply_to: replyTo } : {}),
          }),
        });
      } catch (e) {
        console.error(`[email] Resend inalcançável: ${e instanceof Error ? e.message : String(e)}`);
        return { sent: false, reason: "falha_de_rede" };
      }

      if (!resposta.ok) {
        // O corpo de erro do Resend descreve o problema (domínio não
        // verificado, destinatário inválido) e não ecoa a chave.
        const detalhe = (await resposta.text().catch(() => "")).slice(0, 300);
        console.error(`[email] Resend respondeu ${resposta.status}: ${detalhe}`);
        return { sent: false, reason: "erro_do_provedor" };
      }

      const corpo = (await resposta.json().catch(() => ({}))) as { id?: string };
      return { sent: true, id: corpo.id };
    },
  };
}

/** Remetente configurado no ambiente (ver cabeçalho). */
export function senderAddress(env: Env = envDoDeno): string {
  const completo = env("EMAIL_FROM")?.trim();
  if (completo) return completo;
  const dominio = env("RESEND_FROM_DOMAIN")?.trim().replace(/^@/, "");
  if (dominio) return `Brandplay <nao-responda@${dominio}>`;
  return REMETENTE_DE_TESTE;
}

/** Base dos links que saem por e-mail, sem barra no fim. Vazia quando o ambiente não define. */
export function appUrl(env: Env = envDoDeno): string {
  return (env("APP_URL") || env("SITE_URL") || "").trim().replace(/\/+$/, "");
}

/** Provedor do ambiente, ou null quando o envio está desligado. */
export function emailProvider(env: Env = envDoDeno): EmailProvider | null {
  const chave = env("RESEND_API_KEY")?.trim();
  return chave ? resendProvider(chave) : null;
}

/**
 * Envia um e-mail transacional. Nunca lança: devolve o resultado, e a falha
 * fica no log.
 */
export async function sendEmail(
  message: EmailMessage,
  provider: EmailProvider | null = emailProvider(),
  env: Env = envDoDeno,
): Promise<EmailResult> {
  if (!provider) {
    console.warn("[email] RESEND_API_KEY ausente — e-mail não enviado");
    return { sent: false, reason: "nao_configurado" };
  }
  try {
    return await provider.send({ ...message, from: senderAddress(env) });
  } catch (e) {
    console.error(`[email] envio falhou: ${e instanceof Error ? e.message : String(e)}`);
    return { sent: false, reason: "erro_do_provedor" };
  }
}

/** Escapa texto para interpolar em HTML de e-mail. */
export function escapeHtml(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
