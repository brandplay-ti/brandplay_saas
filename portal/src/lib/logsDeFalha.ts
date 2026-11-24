import type { Tables } from "@/integrations/supabase/types";

// Logs de falha da plataforma (BP-3, 0045): só o superadmin lê, na área
// /admin, juntando todos os clientes. Aqui ficam os rótulos e as regras puras
// dos filtros; a busca está em `useLogsDeFalha`.

export type FalhaDeBanco = Tables<"backend_error_logs">;
export type FalhaDeTela = Tables<"error_reports">;

/** Tabelas que `log-db-error` aceita; o resto chega como `unknown`. */
export const TABELAS_COM_LOG = [
  "organizations",
  "organization_members",
  "opportunities",
  "sports_properties",
  "sponsors",
  "profiles",
] as const;

export const ROTULO_DA_TABELA: Record<string, string> = {
  organizations: "Organizações",
  organization_members: "Membros da organização",
  opportunities: "Negociações",
  sports_properties: "Projetos",
  sponsors: "Patrocinadores",
  profiles: "Perfis",
  unknown: "Outra",
};

export const ACOES_DE_BANCO = ["SELECT", "INSERT", "UPDATE", "DELETE"] as const;

export const SEVERIDADES = ["fatal", "error", "warning"] as const;

export const ROTULO_DA_SEVERIDADE: Record<string, string> = {
  fatal: "Fatal",
  error: "Erro",
  warning: "Aviso",
};

/** Filtro de cliente: todos, só os registros sem organização, ou uma organização. */
export const TODOS_OS_CLIENTES = "todos";
export const SEM_CLIENTE = "sem-organizacao";

export type FiltroDeCliente =
  | { tipo: "todos" }
  | { tipo: "sem-organizacao" }
  | { tipo: "organizacao"; id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ehUuid = (valor: string) => UUID.test(valor);

/** Valor do select de cliente → filtro. Valor desconhecido vale "todos". */
export function filtroDeCliente(valor: string): FiltroDeCliente {
  if (valor === SEM_CLIENTE) return { tipo: "sem-organizacao" };
  if (ehUuid(valor)) return { tipo: "organizacao", id: valor };
  return { tipo: "todos" };
}

/**
 * Busca por usuário: id exato quando é um uuid, senão parte do e-mail. O `%`
 * e o `_` digitados são literais, não curingas do `ilike`.
 */
export function buscaDeUsuario(texto: string): { coluna: "user_id"; valor: string } | { coluna: "user_email"; valor: string } | null {
  const termo = texto.trim();
  if (!termo) return null;
  if (ehUuid(termo)) return { coluna: "user_id", valor: termo };
  return { coluna: "user_email", valor: `%${termo.replace(/[\\%_]/g, (c) => `\\${c}`)}%` };
}

/** Nome do cliente para a tabela: o da organização, ou o motivo de não ter. */
export function nomeDoCliente(organizationId: string | null, nomes: ReadonlyMap<string, string>): string {
  if (!organizationId) return "Sem organização";
  return nomes.get(organizationId) ?? "Organização removida";
}

const DATA_E_HORA = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

/** Momento da falha (timestamptz), no fuso de quem olha. */
export const momentoDaFalha = (iso: string) => DATA_E_HORA.format(new Date(iso));

/** Falha barrada pela RLS (mensagem padrão do Postgres). */
export const ehFalhaDeRls = (mensagem: string | null) => (mensagem ?? "").toLowerCase().includes("row-level security");

type PolicyDoLog = { policyname?: string; cmd?: string };

/** Nomes das policies gravadas com a falha (`matching_policies` é jsonb). */
export function nomesDasPolicies(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((p): p is PolicyDoLog => typeof p === "object" && p !== null)
    .map((p) => p.policyname ?? p.cmd ?? "policy");
}
