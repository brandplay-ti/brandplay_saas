import type { NavModule } from "@/lib/navegacao";

export type ModuloDePermissao = NavModule;
export type AcessoDeModulo = "none" | "read" | "write";
export type PapelDePermissao = "owner" | "admin" | "comercial" | "operacional" | "financeiro";

export const MODULOS_DE_PERMISSAO: { key: ModuloDePermissao; label: string; description: string }[] = [
  { key: "crm", label: "Patrocinadores e CRM", description: "Patrocinadores, pipeline e propostas" },
  { key: "operacional", label: "Entregas e campo", description: "Entregas, evidências e checklists" },
  { key: "financeiro", label: "Financeiro", description: "Parcelas e recebimentos" },
  { key: "team", label: "Equipe", description: "Membros, convites e configurações" },
];

export const PAPEIS_DE_PERMISSAO: { key: PapelDePermissao; label: string }[] = [
  { key: "owner", label: "Proprietário" },
  { key: "admin", label: "Administrador" },
  { key: "comercial", label: "Comercial" },
  { key: "operacional", label: "Operacional" },
  { key: "financeiro", label: "Financeiro" },
];

export const ACESSO_DE_MODULO: Record<AcessoDeModulo, string> = {
  none: "Sem acesso",
  read: "Lê",
  write: "Edita",
};

export function podeVerModulo(access: AcessoDeModulo | undefined): boolean {
  return access === "read" || access === "write";
}

/**
 * Recorte usado enquanto a matriz não carregou. Com a matriz em mãos, o menu
 * segue `organization_role_grants`.
 */
export function podeVerModuloPadrao(role: PapelDePermissao, module: ModuloDePermissao): boolean {
  if (role === "owner" || role === "admin") return true;
  if (module === "team") return false;
  return (
    (module === "crm" && role === "comercial") ||
    (module === "operacional" && role === "operacional") ||
    (module === "financeiro" && role === "financeiro")
  );
}
