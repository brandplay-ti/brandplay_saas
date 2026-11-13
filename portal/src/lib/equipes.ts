import { z } from "zod";

/** Equipes de trabalho (ADR-0012, 0042): regras puras usadas pelas telas. */

export type PapelNaEquipe = "lider" | "membro";
export type AcessoAoProjeto = "read" | "write";

export const PAPEL_NA_EQUIPE: Record<PapelNaEquipe, string> = {
  lider: "Líder",
  membro: "Membro",
};

export const ACESSO_AO_PROJETO: Record<AcessoAoProjeto, string> = {
  read: "Leitura",
  write: "Edição",
};

export const ESCOPO_DE_PERMISSAO: Record<string, string> = {
  organizacao: "Organização",
  equipe: "Minhas equipes",
};

export const esquemaDaEquipe = z.object({
  name: z.string().trim().min(1, "Informe o nome da equipe.").max(80, "Use até 80 caracteres."),
  description: z.string().trim().max(500, "Use até 500 caracteres."),
});

export type DadosDaEquipe = z.infer<typeof esquemaDaEquipe>;

export type Projeto = { id: string; name: string; parent_property_id: string | null };
export type ProjetoNaArvore = Projeto & { nivel: number };

const porNome = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "pt-BR");

/**
 * Projetos em ordem de árvore (mãe antes dos subprojetos, irmãos por
 * nome), com o nível de cada uma. Subprojeto cuja mãe não está na lista sobe
 * para a raiz; um ciclo na hierarquia não trava a lista.
 */
export function arvoreDeProjetos(projetos: Projeto[]): ProjetoNaArvore[] {
  const ids = new Set(projetos.map((p) => p.id));
  const filhos = new Map<string | null, Projeto[]>();
  for (const p of projetos) {
    const mae = p.parent_property_id && ids.has(p.parent_property_id) ? p.parent_property_id : null;
    filhos.set(mae, [...(filhos.get(mae) ?? []), p]);
  }

  const resultado: ProjetoNaArvore[] = [];
  const visitados = new Set<string>();
  const visitar = (mae: string | null, nivel: number) => {
    for (const p of [...(filhos.get(mae) ?? [])].sort(porNome)) {
      if (visitados.has(p.id)) continue;
      visitados.add(p.id);
      resultado.push({ ...p, nivel });
      visitar(p.id, nivel + 1);
    }
  };
  visitar(null, 0);

  // Num ciclo ninguém é raiz: o primeiro por nome entra como raiz.
  for (const p of [...projetos].sort(porNome)) {
    if (visitados.has(p.id)) continue;
    visitados.add(p.id);
    resultado.push({ ...p, nivel: 0 });
    visitar(p.id, 1);
  }
  return resultado;
}

export type VinculoDeMembro = { team_id: string; user_id: string; status: string; expires_at: string | null };

/** Vínculo que vale agora: ativo e sem data de fim vencida. */
export function vinculoVigente(vinculo: Pick<VinculoDeMembro, "status" | "expires_at">, agora = new Date()): boolean {
  return vinculo.status === "ativo" && (vinculo.expires_at === null || new Date(vinculo.expires_at) > agora);
}

/** Equipes ativas de cada pessoa, por nome, para a coluna "Equipes" da lista de membros. */
export function equipesPorPessoa(
  equipes: { id: string; name: string; status: string }[],
  vinculos: VinculoDeMembro[],
  agora = new Date(),
): Map<string, { id: string; name: string }[]> {
  const ativas = new Map(equipes.filter((e) => e.status === "ativo").map((e) => [e.id, e]));
  const porPessoa = new Map<string, { id: string; name: string }[]>();
  for (const v of vinculos) {
    const equipe = ativas.get(v.team_id);
    if (!equipe || !vinculoVigente(v, agora)) continue;
    porPessoa.set(v.user_id, [...(porPessoa.get(v.user_id) ?? []), { id: equipe.id, name: equipe.name }]);
  }
  for (const lista of porPessoa.values()) lista.sort(porNome);
  return porPessoa;
}

/** Valor de um `<input type="date">` (aaaa-mm-dd) como fim daquele dia, no fuso de quem usa. */
export function fimDoDia(data: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
  const fim = new Date(`${data}T23:59:59`);
  return Number.isNaN(fim.getTime()) ? null : fim.toISOString();
}

/** Data de fim gravada no banco de volta para o `<input type="date">`. */
export function dataDoInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const doisDigitos = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
}
