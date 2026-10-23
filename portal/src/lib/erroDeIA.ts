import { FunctionsFetchError } from "@supabase/supabase-js";
import { toast } from "sonner";
import { readEdgeFunctionError } from "@/lib/edgeFunctionError";

/**
 * Erros das Edge Functions de IA (backlog IA-13).
 *
 * As funções migradas para a camada de IA devolvem `{ error, codigo }`:
 * `error` já é a mensagem para o usuário (nunca cita fornecedor nem detalhe
 * técnico) e `codigo` diz qual é o caso. Os códigos são os de
 * `supabase/functions/_shared/ai/erros.ts` — o teste confere.
 */
export const CODIGOS_DE_ERRO_DE_IA = [
  "chave_invalida",
  "sem_saldo",
  "limite_taxa",
  "indisponivel",
  "resposta_invalida",
  "ia_desabilitada",
  "orcamento_esgotado",
  "cobranca_bloqueada",
] as const;

export type CodigoDeErroDeIA = (typeof CODIGOS_DE_ERRO_DE_IA)[number];

export interface MensagemDeErroDeIA {
  titulo: string;
  descricao: string;
  /** Nulo quando o erro não veio da camada de IA (validação, recurso não encontrado, rede). */
  codigo: CodigoDeErroDeIA | null;
}

const MENSAGEM_SUPORTE = "Não foi possível usar a IA da sua organização no momento. Entre em contato com o suporte.";

/** Título por caso, e a descrição usada se a função não mandar `error`. */
const POR_CODIGO: Record<CodigoDeErroDeIA, { titulo: string; descricao: string }> = {
  chave_invalida: { titulo: "IA indisponível para a sua organização", descricao: MENSAGEM_SUPORTE },
  sem_saldo: { titulo: "IA indisponível para a sua organização", descricao: MENSAGEM_SUPORTE },
  limite_taxa: {
    titulo: "Muitas solicitações de IA",
    descricao: "Muitas solicitações de IA em pouco tempo. Tente novamente em instantes.",
  },
  indisponivel: {
    titulo: "IA indisponível",
    descricao: "O serviço de IA está indisponível no momento. Tente novamente em alguns minutos.",
  },
  resposta_invalida: {
    titulo: "Resposta inesperada da IA",
    descricao: "A IA retornou uma resposta inesperada. Tente novamente.",
  },
  ia_desabilitada: {
    titulo: "IA desativada",
    descricao: "Os recursos de IA estão desativados para a sua organização.",
  },
  orcamento_esgotado: {
    titulo: "Limite de IA atingido",
    descricao: "O limite mensal de uso de IA da sua organização foi atingido. Fale com o administrador da conta.",
  },
  cobranca_bloqueada: {
    titulo: "Acesso suspenso",
    descricao: "O acesso da sua organização está suspenso. Regularize o plano para voltar a usar a IA.",
  },
};

const ERRO_GENERICO = "Ocorreu um erro inesperado. Tente novamente em instantes.";
const SEM_CONEXAO = "Não foi possível falar com o servidor. Verifique sua conexão e tente novamente.";

export function ehCodigoDeErroDeIA(valor: unknown): valor is CodigoDeErroDeIA {
  return typeof valor === "string" && (CODIGOS_DE_ERRO_DE_IA as readonly string[]).includes(valor);
}

/**
 * Traduz o corpo de erro da função na mensagem da tela. Sem `codigo`
 * conhecido, o erro não é da camada: mostra o `error` da função (ex.:
 * "Conta não encontrada") sob o título da tela.
 */
export function traduzirErroDeIA(
  corpo: { error?: string | null; codigo?: unknown },
  tituloPadrao: string,
): MensagemDeErroDeIA {
  const mensagem = corpo.error?.trim() || null;
  if (ehCodigoDeErroDeIA(corpo.codigo)) {
    const caso = POR_CODIGO[corpo.codigo];
    return { titulo: caso.titulo, descricao: mensagem ?? caso.descricao, codigo: corpo.codigo };
  }
  return { titulo: tituloPadrao, descricao: mensagem ?? ERRO_GENERICO, codigo: null };
}

/**
 * Lê o erro de `supabase.functions.invoke`. Fora de 2xx, o corpo da função
 * fica em `error.context`; a mensagem do próprio `invoke` ("Edge Function
 * returned a non-2xx status code") é técnica e não vai para a tela.
 */
export async function lerErroDeIA(error: unknown, data: unknown, tituloPadrao: string): Promise<MensagemDeErroDeIA> {
  if (error instanceof FunctionsFetchError) return { titulo: tituloPadrao, descricao: SEM_CONEXAO, codigo: null };
  const corpo = (await readEdgeFunctionError(error, data)) as { error?: string; codigo?: unknown };
  const soMensagemDoInvoke = error instanceof Error && corpo.error === error.message;
  return traduzirErroDeIA(soMensagemDoInvoke ? { codigo: corpo.codigo } : corpo, tituloPadrao);
}

/** Toast padronizado para a falha de uma função de IA. */
export async function avisarErroDeIA(error: unknown, data: unknown, tituloPadrao: string): Promise<void> {
  const { titulo, descricao } = await lerErroDeIA(error, data, tituloPadrao);
  toast.error(titulo, { description: descricao });
}

/**
 * A função respondeu, mas a parte de IA falhou (`aviso_ia`): ex.: riscos de
 * churn calculados sem a recomendação. Aviso, não erro — o resto da tela vale.
 */
export function avisarIAParcial(aviso: { error?: string | null; codigo?: unknown } | null | undefined, tituloPadrao: string): void {
  if (!aviso) return;
  const { titulo, descricao } = traduzirErroDeIA(aviso, tituloPadrao);
  toast.warning(titulo, { description: descricao });
}
