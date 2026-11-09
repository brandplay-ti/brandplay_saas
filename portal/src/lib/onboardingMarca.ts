// Etapa de marca no onboarding: ao contratar, a organização indica as cores
// e o logo que vão para relatórios, propostas e contratos
// (docs/architecture/plano-relatorios-html.md §5.2, kit de marca da 0034).
//
// Todo login passa pelo onboarding (Auth.tsx), então a etapa só aparece
// enquanto a organização não tem kit de marca, e "Pular por agora" fica
// guardado por organização neste navegador, para não voltar a cada entrada.

export type SituacaoDaMarca = {
  /** Papel de quem entrou na organização. */
  papel: string;
  /** Já existe linha em organization_brand_kits. */
  temKit: boolean;
  /** A organização tem acesso (billing_status.access); sem acesso, o kit não grava. */
  temAcesso: boolean;
  /** Pulou a etapa para esta organização neste navegador. */
  pulou: boolean;
};

/** Só owner/admin, com acesso, sem kit e sem ter pulado. */
export const precisaDaEtapaDeMarca = (s: SituacaoDaMarca): boolean =>
  (s.papel === "owner" || s.papel === "admin") && s.temAcesso && !s.temKit && !s.pulou;

const chave = (orgId: string) => `brandplay:onboarding-marca:${orgId}`;

export const pulouEtapaDeMarca = (orgId: string): boolean => {
  try {
    return localStorage.getItem(chave(orgId)) === "pulada";
  } catch {
    return false;
  }
};

export const lembrarEtapaDeMarcaPulada = (orgId: string): void => {
  try {
    localStorage.setItem(chave(orgId), "pulada");
  } catch {
    // Sem armazenamento, a etapa volta no próximo login.
  }
};
