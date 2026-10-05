export type Lifecycle =
  | "prospect"
  | "em_abordagem"
  | "qualificado"
  | "em_negociacao"
  | "cliente_ativo"
  | "cliente_inativo"
  | "perdido"
  | "arquivado";

export type Priority = "A" | "B" | "C";
export type Health = "saudavel" | "atencao" | "risco" | "nao_aplicavel";

export const LIFECYCLE_LABEL: Record<Lifecycle, string> = {
  prospect: "Prospect",
  em_abordagem: "Em abordagem",
  qualificado: "Qualificado",
  em_negociacao: "Em negociação",
  cliente_ativo: "Cliente ativo",
  cliente_inativo: "Cliente inativo",
  perdido: "Perdido",
  arquivado: "Arquivado",
};

export const LIFECYCLE_ORDER: Lifecycle[] = [
  "prospect",
  "em_abordagem",
  "qualificado",
  "em_negociacao",
  "cliente_ativo",
  "cliente_inativo",
  "perdido",
  "arquivado",
];

export const LIFECYCLE_CLASS: Record<Lifecycle, string> = {
  prospect: "bg-muted text-muted-foreground border-border",
  em_abordagem: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  qualificado: "bg-indigo-500/15 text-indigo-600 border-indigo-500/30",
  em_negociacao: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  cliente_ativo: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  cliente_inativo: "bg-muted text-muted-foreground border-border",
  perdido: "bg-destructive/15 text-destructive border-destructive/30",
  arquivado: "bg-muted text-muted-foreground border-border",
};

export const HEALTH_LABEL: Record<Health, string> = {
  saudavel: "Saudável",
  atencao: "Atenção",
  risco: "Risco",
  nao_aplicavel: "Não aplicável",
};

export const HEALTH_CLASS: Record<Health, string> = {
  saudavel: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  atencao: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  risco: "bg-destructive/15 text-destructive border-destructive/30",
  nao_aplicavel: "bg-muted text-muted-foreground border-border",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  A: "A — estratégica",
  B: "B — relevante",
  C: "C — exploratória",
};

export const TASK_TYPE_LABEL: Record<string, string> = {
  followup: "Follow-up",
  reuniao: "Reunião",
  ligacao: "Ligação",
  email: "E-mail",
  whatsapp: "WhatsApp",
  proposta: "Proposta",
  renovacao: "Renovação",
  entrega: "Entrega",
  outro: "Outro",
};

export const TASK_PRIORITY_LABEL: Record<string, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

export const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export const formatDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString("pt-BR") : "—";

export const daysSince = (v?: string | null) => {
  if (!v) return null;
  const diff = Date.now() - new Date(v).getTime();
  return Math.floor(diff / 86400000);
};

export interface FitFactor {
  label: string;
  points: number;
  max: number;
  detail: string;
  missing?: boolean;
}

export interface FitResult {
  score: number;
  factors: FitFactor[];
  gaps: string[];
}

/**
 * Fit comercial calculado apenas com dados verificáveis já registrados na conta.
 * Fatores sem dado não pontuam e viram lacuna explícita — nunca são estimados.
 */
export const computeAccountFit = (input: {
  contractsActive: number;
  contractsTotal: number;
  opportunitiesOpen: number;
  opportunitiesWon: number;
  opportunitiesLost: number;
  lastContactAt?: string | null;
  contactsCount: number;
  brandsCount: number;
  overdueInstallments: number;
  deliveriesApproved: number;
  deliveriesLate: number;
}): FitResult => {
  const factors: FitFactor[] = [];
  const gaps: string[] = [];

  // Histórico de contratos (0-25)
  if (input.contractsTotal > 0) {
    const p = Math.min(25, 10 + input.contractsActive * 10);
    factors.push({ label: "Histórico contratual", points: p, max: 25, detail: `${input.contractsTotal} contrato(s), ${input.contractsActive} ativo(s)` });
  } else {
    factors.push({ label: "Histórico contratual", points: 0, max: 25, detail: "Nenhum contrato registrado", missing: true });
    gaps.push("Sem contrato registrado para esta conta");
  }

  // Conversão comercial (0-20)
  const decided = input.opportunitiesWon + input.opportunitiesLost;
  if (decided > 0) {
    const p = Math.round((input.opportunitiesWon / decided) * 20);
    factors.push({ label: "Conversão comercial", points: p, max: 20, detail: `${input.opportunitiesWon} ganha(s) de ${decided} decidida(s)` });
  } else {
    factors.push({ label: "Conversão comercial", points: 0, max: 20, detail: "Nenhuma negociação decidida", missing: true });
    gaps.push("Nenhuma negociação concluída para medir conversão");
  }

  // Engajamento recente (0-20)
  const d = daysSince(input.lastContactAt);
  if (d === null) {
    factors.push({ label: "Engajamento recente", points: 0, max: 20, detail: "Sem interação registrada", missing: true });
    gaps.push("Nenhuma interação registrada na conta");
  } else {
    const p = d <= 15 ? 20 : d <= 30 ? 15 : d <= 60 ? 8 : 0;
    factors.push({ label: "Engajamento recente", points: p, max: 20, detail: `Último contato há ${d} dia(s)` });
    if (p === 0) gaps.push("Conta sem contato há mais de 60 dias");
  }

  // Mapa de relacionamento (0-15)
  if (input.contactsCount > 0) {
    const p = Math.min(15, input.contactsCount * 5);
    factors.push({ label: "Comitê de decisão", points: p, max: 15, detail: `${input.contactsCount} contato(s) mapeado(s)` });
    if (input.contactsCount < 3) gaps.push("Comitê de decisão parcialmente mapeado");
  } else {
    factors.push({ label: "Comitê de decisão", points: 0, max: 15, detail: "Nenhum contato cadastrado", missing: true });
    gaps.push("Nenhum contato cadastrado");
  }

  // Marcas ativas (0-10)
  if (input.brandsCount > 0) {
    factors.push({ label: "Marcas da conta", points: Math.min(10, input.brandsCount * 5), max: 10, detail: `${input.brandsCount} marca(s)` });
  } else {
    factors.push({ label: "Marcas da conta", points: 0, max: 10, detail: "Nenhuma marca cadastrada", missing: true });
    gaps.push("Nenhuma marca cadastrada para a conta");
  }

  // Saúde operacional/financeira (0-10)
  const penalty = input.overdueInstallments * 5 + input.deliveriesLate * 3;
  const opPoints = Math.max(0, 10 - penalty);
  factors.push({
    label: "Saúde operacional",
    points: opPoints,
    max: 10,
    detail: `${input.overdueInstallments} parcela(s) em atraso · ${input.deliveriesLate} entrega(s) atrasada(s) · ${input.deliveriesApproved} aprovada(s)`,
  });
  if (input.overdueInstallments > 0) gaps.push("Existem parcelas em atraso");
  if (input.deliveriesLate > 0) gaps.push("Existem entregas atrasadas");

  const score = factors.reduce((s, f) => s + f.points, 0);
  return { score: Math.max(0, Math.min(100, score)), factors, gaps };
};

export const toCsv = (rows: Record<string, unknown>[]): string => {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(";"), ...rows.map((r) => headers.map((h) => escape(r[h])).join(";"))].join("\n");
};

export const downloadCsv = (filename: string, csv: string) => {
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
