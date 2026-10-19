import { z } from "zod";

/**
 * Recuperação de senha (`/esqueci-senha` → e-mail do GoTrue → `/resetar-senha`).
 *
 * O link do e-mail chega com uma sessão de recuperação no fragmento da URL, que
 * o client do Supabase consome sozinho ao carregar. Daqui para frente a pessoa
 * está autenticada e a troca é um `auth.updateUser({ password })` comum.
 */

/** Mesmo mínimo do cadastro e do GoTrue (`GOTRUE_PASSWORD_MIN_LENGTH`, padrão 6). */
export const SENHA_MINIMO = 6;
/** O bcrypt do GoTrue só considera 72 bytes; acima disso ele recusa a senha. */
export const SENHA_MAXIMO = 72;

export const pedidoRecuperacaoSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, "Informe seu e-mail.").email("Informe um e-mail válido."),
});

export const novaSenhaSchema = z
  .object({
    senha: z
      .string()
      .min(SENHA_MINIMO, `A senha precisa ter pelo menos ${SENHA_MINIMO} caracteres.`)
      .max(SENHA_MAXIMO, `A senha pode ter no máximo ${SENHA_MAXIMO} caracteres.`),
    confirmacao: z.string(),
  })
  .refine((v) => v.senha === v.confirmacao, {
    message: "As senhas não coincidem.",
    path: ["confirmacao"],
  });

/**
 * De qual login a pessoa veio. O portal do patrocinador e o painel da
 * organização compartilham o mesmo Auth, mas cada um volta para a própria
 * tela. Só os valores conhecidos são aceitos: o parâmetro vem da URL e nunca
 * vira destino de redirecionamento cru.
 */
export type OrigemLogin = "painel" | "portal";

export function lerOrigem(valor: string | null): OrigemLogin {
  return valor === "portal" ? "portal" : "painel";
}

export const ROTAS_DA_ORIGEM: Record<OrigemLogin, { login: string; aposRedefinir: string }> = {
  // O onboarding decide o resto (organização, superadmin), como no login.
  painel: { login: "/auth", aposRedefinir: "/onboarding/organizacao" },
  portal: { login: "/portal/login", aposRedefinir: "/portal" },
};

/**
 * Para onde o link do e-mail leva. Fica sob o `SITE_URL` do GoTrue (mesmo
 * host), por isso não precisa de entrada própria em `ADDITIONAL_REDIRECT_URLS`.
 */
export function urlDeRedefinicao(origemDoSite: string, origem: OrigemLogin): string {
  const url = `${origemDoSite}/resetar-senha`;
  return origem === "portal" ? `${url}?destino=portal` : url;
}

export function linkParaEsqueciSenha(origem: OrigemLogin): string {
  return origem === "portal" ? "/esqueci-senha?destino=portal" : "/esqueci-senha";
}

/**
 * Link vencido ou já usado: o GoTrue redireciona com `error_code` no
 * fragmento (às vezes na query) em vez da sessão. O client do Supabase não
 * apaga esses parâmetros nem derruba uma sessão que já existia, então a tela
 * precisa ler o erro por conta própria — senão mostraria o formulário para
 * quem já estava logado, como se o link tivesse funcionado.
 */
export function lerErroDoLink(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const params = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  parsed.searchParams.forEach((valor, chave) => {
    if (!params.has(chave)) params.set(chave, valor);
  });

  const codigo = params.get("error_code");
  if (!codigo && !params.get("error") && !params.get("error_description")) return null;
  if (codigo === "otp_expired") return "Este link expirou ou já foi usado. Peça um novo para continuar.";
  return "Este link de recuperação não é válido. Peça um novo para continuar.";
}

interface ErroDeAuth {
  code?: string;
  status?: number;
}

/**
 * Pedido do link. O GoTrue responde igual para e-mail cadastrado ou não
 * (não revela quem tem conta), então só sobra o limite de envio e a falha
 * genérica.
 */
export function mensagemErroPedido(erro: ErroDeAuth): string {
  if (erro.status === 429 || erro.code === "over_email_send_rate_limit" || erro.code === "over_request_rate_limit") {
    return "Muitas tentativas seguidas. Aguarde um minuto e tente de novo.";
  }
  return "Não foi possível enviar o e-mail agora. Tente novamente em instantes.";
}

export function mensagemErroRedefinicao(erro: ErroDeAuth): string {
  if (erro.code === "same_password") return "A nova senha precisa ser diferente da atual.";
  if (erro.code === "weak_password") return "Essa senha é fraca demais. Escolha uma senha mais longa.";
  if (
    erro.status === 401 ||
    erro.status === 403 ||
    erro.code === "session_not_found" ||
    erro.code === "session_expired" ||
    erro.code === "bad_jwt"
  ) {
    return "Sua sessão de recuperação expirou. Peça um novo link.";
  }
  return "Não foi possível redefinir a senha. Tente novamente.";
}
