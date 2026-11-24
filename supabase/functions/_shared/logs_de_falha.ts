// Saneamento do que o navegador manda para `log-db-error` e `report-error`.
//
// O registro é telemetria da plataforma (0045): só o superadmin lê. Mesmo
// assim, nada do corpo é confiável. A organização só fica no registro quando o
// usuário do JWT é membro ativo dela — senão alguém gravaria falhas em nome de
// outra organização. Texto livre tem teto, para a tabela não virar depósito.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACOES = new Set(["SELECT", "INSERT", "UPDATE", "DELETE"]);

/** Tetos de tamanho, em caracteres. */
export const LIMITES = {
  mensagem: 2000,
  detalhe: 4000,
  dica: 1000,
  codigo: 40,
  arquivo: 300,
  chaves: 50,
  chave: 100,
} as const;

/** Texto cortado no teto; qualquer outra coisa vira nulo. */
export function textoLimitado(valor: unknown, max: number): string | null {
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  if (!texto) return null;
  return texto.length > max ? texto.slice(0, max) : texto;
}

/** Ação de banco conhecida, em maiúsculas; o resto é `unknown`. */
export function acaoNormalizada(valor: unknown): string {
  const acao = typeof valor === "string" ? valor.trim().toUpperCase() : "";
  return ACOES.has(acao) ? acao : "unknown";
}

/** Linha de código: inteiro positivo plausível, ou nulo. */
export function linhaNormalizada(valor: unknown): number | null {
  return typeof valor === "number" && Number.isInteger(valor) && valor > 0 && valor < 1_000_000 ? valor : null;
}

/** Nomes das colunas tentadas: só texto, com teto de quantidade e tamanho. */
export function chavesNormalizadas(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .map((chave) => textoLimitado(chave, LIMITES.chave))
    .filter((chave): chave is string => chave !== null)
    .slice(0, LIMITES.chaves);
}

/** Id de organização em formato válido, ou nulo. */
export function uuidOuNulo(valor: unknown): string | null {
  return typeof valor === "string" && UUID.test(valor) ? valor : null;
}

/**
 * Organização que pode ir para o registro: a pedida, se o usuário for membro
 * ativo dela. `ehMembro` consulta `organization_members` com a service role.
 */
export async function organizacaoConfirmada(
  pedida: unknown,
  userId: string | null,
  ehMembro: (organizationId: string, userId: string) => Promise<boolean>,
): Promise<{ organizationId: string | null; descartada: boolean }> {
  const id = uuidOuNulo(pedida);
  if (!id) return { organizationId: null, descartada: pedida != null && pedida !== "" };
  if (!userId) return { organizationId: null, descartada: true };
  try {
    return (await ehMembro(id, userId))
      ? { organizationId: id, descartada: false }
      : { organizationId: null, descartada: true };
  } catch {
    return { organizationId: null, descartada: true };
  }
}
