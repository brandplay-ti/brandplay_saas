import { dataLocal } from "@/lib/datas";
import { rotuloDaRede } from "@/lib/redesSociais";
import type { PaginaRelatorio } from "@/lib/relatorioLanding";

/** Fonte de título do estilo (condensada no escuro, Poppins no claro). */
export const classeDisplay = "font-[family-name:var(--rl-display)] tracking-[var(--rl-display-tracking)]";

export const verNa = (rede: string) => (rede === "site" ? "Abrir link" : `Ver no ${rotuloDaRede(rede)}`);

const mesAno = (d: string) => dataLocal(d).toLocaleDateString("pt-BR", { month: "short", year: "numeric" }).replace(".", "");

export function periodoDaPropriedade(p: PaginaRelatorio["propriedade"]): string | null {
  if (!p) return null;
  if (p.inicio && p.fim) return `${mesAno(p.inicio)} a ${mesAno(p.fim)}`;
  if (p.inicio) return `desde ${mesAno(p.inicio)}`;
  return p.temporada ? `Temporada ${p.temporada}` : null;
}

/** Logo da organização que funciona sobre o fundo: versão clara no escuro, escura no claro. */
export function logoDaOrganizacao(org: PaginaRelatorio["organizacao"], fundo: "escuro" | "claro"): string | null {
  if (!org) return null;
  const ordem = fundo === "escuro" ? ["clara", "sem_fundo", "horizontal"] : ["escura", "horizontal", "sem_fundo"];
  for (const kind of ordem) if (org.logos[kind]) return org.logos[kind];
  return org.logo_url;
}
