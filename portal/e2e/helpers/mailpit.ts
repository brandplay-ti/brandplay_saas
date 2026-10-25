import { expect, type APIRequestContext } from "@playwright/test";
import { GOTRUE_MAILER_SUBJECTS, baseUrlSupabasePublica, linkDeVerificacaoGotrue } from "../../src/lib/gotrueMailerLinks";

export const mailpitBaseUrl = (process.env.E2E_MAILPIT_URL ?? "http://localhost:8026").replace(/\/$/, "");

export const supabasePublicUrl = baseUrlSupabasePublica();

interface MensagemMailpitResumo {
  ID: string;
  Subject?: string;
}

interface MensagemMailpitCorpo {
  HTML: string;
  Text: string;
  Subject?: string;
}

/** Aguarda a primeira mensagem do Mailpit para o destinatário (stack local). */
export async function aguardarMensagem(
  request: APIRequestContext,
  email: string,
  opts?: { timeout?: number; message?: string },
): Promise<string> {
  let id: string | undefined;
  await expect
    .poll(
      async () => {
        const r = await request.get(`${mailpitBaseUrl}/api/v1/search`, { params: { query: `to:"${email}"` } });
        const corpo = (await r.json()) as { messages: MensagemMailpitResumo[] };
        id = corpo.messages[0]?.ID;
        return id;
      },
      {
        message: opts?.message ?? `e-mail para ${email} no Mailpit (${mailpitBaseUrl})`,
        timeout: opts?.timeout ?? 20_000,
      },
    )
    .toBeTruthy();
  return id!;
}

export async function lerMensagem(request: APIRequestContext, id: string): Promise<MensagemMailpitCorpo> {
  const r = await request.get(`${mailpitBaseUrl}/api/v1/message/${id}`);
  return (await r.json()) as MensagemMailpitCorpo;
}

export { linkDeVerificacaoGotrue };

/** Garante que o e-mail de recuperação usou o template PT-BR versionado, não o padrão do GoTrue. */
export function assertTemplateRecuperacaoPtBr(html: string, subject?: string): void {
  expect(html).toContain('lang="pt-BR"');
  expect(html).toContain("Redefina sua senha");
  expect(html).toContain("Criar nova senha");
  expect(html).toContain("#6206C8");
  expect(html).not.toMatch(/Reset Your Password|Reset Password/i);

  if (subject !== undefined) {
    expect(subject).toBe(GOTRUE_MAILER_SUBJECTS.recuperacao);
  }
}
