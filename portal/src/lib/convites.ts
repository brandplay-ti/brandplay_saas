import { parsePlanLimitError } from "@/lib/billing";

/**
 * Mensagem para o convidado quando aceitar ou recusar falha. Quem aceita não
 * administra a organização, então o limite do plano vira um aviso para falar
 * com quem convidou, não um caminho de upgrade.
 */
export function mensagemDeErroDoConvite(erro: unknown, organizacao: string): string {
  const limite = parsePlanLimitError(erro);
  if (limite) {
    return limite.resource === "sem_plano"
      ? `${organizacao} está sem plano ativo. Avise quem enviou o convite.`
      : `${organizacao} atingiu o limite de usuários do plano. Avise quem enviou o convite.`;
  }
  const mensagem = erro && typeof erro === "object" ? (erro as { message?: unknown }).message : null;
  return typeof mensagem === "string" && mensagem.trim() ? mensagem : "Não foi possível concluir. Tente de novo.";
}
