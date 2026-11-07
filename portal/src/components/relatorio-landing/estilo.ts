import { dataLocal } from "@/lib/datas";
import { rotuloDaRede } from "@/lib/redesSociais";
import type { PaginaRelatorio } from "@/lib/relatorioLanding";

/** Fonte de título do estilo (condensada no escuro, Poppins no claro). */
export const classeDisplay = "font-[family-name:var(--rl-display)] tracking-[var(--rl-display-tracking)]";

export const verNa = (rede: string) => (rede === "site" ? "Abrir link" : `Ver no ${rotuloDaRede(rede)}`);

export const comInicialMaiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const mes = (data: Date) => data.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");

// A capitalização fica no texto: `capitalize` do CSS escrevia "Mar De 2026".
const mesAno = (d: string) => {
  const data = dataLocal(d);
  return `${comInicialMaiuscula(mes(data))} ${data.getFullYear()}`;
};

/** "Mar 2026 – Set 2026". */
export function periodoDaPropriedade(p: PaginaRelatorio["propriedade"]): string | null {
  if (!p) return null;
  if (p.inicio && p.fim) return `${mesAno(p.inicio)} – ${mesAno(p.fim)}`;
  if (p.inicio) return `Desde ${mesAno(p.inicio)}`;
  return p.temporada ? `Temporada ${p.temporada}` : null;
}

/** "14 mar". */
export const diaEMes = (iso: string) => {
  const data = new Date(iso);
  return `${String(data.getDate()).padStart(2, "0")} ${mes(data)}`;
};

/** Logo da organização que funciona sobre o fundo: versão clara no escuro, escura no claro. */
export function logoDaOrganizacao(org: PaginaRelatorio["organizacao"], fundo: "escuro" | "claro"): string | null {
  if (!org) return null;
  const ordem = fundo === "escuro" ? ["clara", "sem_fundo", "horizontal"] : ["escura", "horizontal", "sem_fundo"];
  for (const kind of ordem) if (org.logos[kind]) return org.logos[kind];
  return org.logo_url;
}
