import type { NavModule } from "@/lib/navegacao";

export type ModuloDePermissao = NavModule;
export type AcessoDeModulo = "none" | "read" | "write";
export type PapelDePermissao = "owner" | "admin" | "comercial" | "operacional" | "financeiro";
/** Tipo de cliente da organização (0043). A marca não tem funil nem captação. */
export type TipoDeCliente = "agencia" | "marca";

export const TIPOS_DE_CLIENTE: { key: TipoDeCliente; label: string; description: string }[] = [
  { key: "agencia", label: "Agência", description: "Vende patrocínio: capta patrocinadores e conduz o funil de vendas" },
  { key: "marca", label: "Marca", description: "Compra patrocínio: acompanha contratos, entregas e resultados" },
];

export const MODULOS_DE_PERMISSAO: { key: ModuloDePermissao; label: string; description: string }[] = [
  { key: "crm", label: "Patrocinadores e CRM", description: "Patrocinadores, cotas e tarefas" },
  { key: "vendas", label: "Funil e captação", description: "Pipeline, propostas, leads e lead scoring" },
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

export function rotuloDoPapel(role: string): string {
  return PAPEIS_DE_PERMISSAO.find((p) => p.key === role)?.label ?? role;
}

export const ACESSO_DE_MODULO: Record<AcessoDeModulo, string> = {
  none: "Sem acesso",
  read: "Lê",
  write: "Edita",
};

/** Teto por tipo, igual a `modulo_disponivel` do banco: `vendas` não existe para a marca. */
export function moduloDisponivel(tipo: TipoDeCliente, module: ModuloDePermissao): boolean {
  return !(tipo === "marca" && module === "vendas");
}

/** Módulos da matriz que a organização vê na tela de permissões. */
export function modulosDoTipo(tipo: TipoDeCliente) {
  return MODULOS_DE_PERMISSAO.filter((m) => moduloDisponivel(tipo, m.key));
}

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
    ((module === "crm" || module === "vendas") && role === "comercial") ||
    (module === "operacional" && role === "operacional") ||
    (module === "financeiro" && role === "financeiro")
  );
}
