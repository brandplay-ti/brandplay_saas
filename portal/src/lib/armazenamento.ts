// Uso de armazenamento da mídia da edição (BP-7.17, D3, RF12). Os números vêm
// da view `edition_storage_usage` (0049): soma do tamanho real dos objetos já
// enviados ao R2, gravado pelo servidor. Nunca do tamanho que o navegador
// informou (RNF2).

/** Tamanho em bytes para a tela (base 1000, como os fornecedores cobram). */
export function formatarBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return "—";
  const unidades = ["B", "KB", "MB", "GB", "TB"];
  let valor = bytes;
  let i = 0;
  while (valor >= 1000 && i < unidades.length - 1) {
    valor /= 1000;
    i++;
  }
  const casas = i === 0 || valor >= 100 ? 0 : 1;
  return `${valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })} ${unidades[i]}`;
}

export type LinhaDeUso = {
  property_id: string | null;
  total_bytes: number | null;
  object_count: number | null;
};

export type ProjetoDoUso = { id: string; name: string; parent_property_id: string | null };

export type UsoDaEdicao = { id: string; name: string; bytes: number; objetos: number };

export type UsoDoProjeto = {
  id: string;
  name: string;
  bytes: number;
  objetos: number;
  /** Edições com material, da maior para a menor. Inclui o próprio projeto quando ele guarda mídia direto. */
  edicoes: UsoDaEdicao[];
};

export type ResumoDoUso = {
  bytes: number;
  objetos: number;
  /** Projetos raiz com material, do maior para o menor. */
  projetos: UsoDoProjeto[];
};

const NOME_DESCONHECIDO = "Projeto sem nome";

/** Topo da cadeia de `parent_property_id`, sem girar em ciclo. */
function raizDe(id: string, porId: Map<string, ProjetoDoUso>): string {
  let atual = id;
  const vistos = new Set<string>([id]);
  for (;;) {
    const mae = porId.get(atual)?.parent_property_id;
    if (!mae || !porId.has(mae) || vistos.has(mae)) return atual;
    vistos.add(mae);
    atual = mae;
  }
}

const maiorPrimeiro = (a: { bytes: number; name: string }, b: { bytes: number; name: string }) =>
  b.bytes - a.bytes || a.name.localeCompare(b.name, "pt-BR");

/**
 * Agrupa o uso por projeto raiz, com o detalhe por edição. Linha sem projeto
 * ou com número inválido é ignorada; projeto que não está na lista aparece
 * como raiz dele mesmo.
 */
export function resumirUso(linhas: LinhaDeUso[], projetos: ProjetoDoUso[]): ResumoDoUso {
  const porId = new Map(projetos.map((p) => [p.id, p]));
  const grupos = new Map<string, UsoDoProjeto>();
  let bytes = 0;
  let objetos = 0;

  for (const linha of linhas) {
    if (!linha.property_id) continue;
    const b = Number(linha.total_bytes ?? 0);
    const o = Number(linha.object_count ?? 0);
    if (!Number.isFinite(b) || b < 0 || !Number.isFinite(o) || o < 0) continue;

    const raizId = raizDe(linha.property_id, porId);
    const grupo = grupos.get(raizId) ?? {
      id: raizId,
      name: porId.get(raizId)?.name ?? NOME_DESCONHECIDO,
      bytes: 0,
      objetos: 0,
      edicoes: [],
    };
    grupo.bytes += b;
    grupo.objetos += o;
    const edicao = grupo.edicoes.find((e) => e.id === linha.property_id);
    if (edicao) {
      edicao.bytes += b;
      edicao.objetos += o;
    } else {
      grupo.edicoes.push({
        id: linha.property_id,
        name: porId.get(linha.property_id)?.name ?? NOME_DESCONHECIDO,
        bytes: b,
        objetos: o,
      });
    }
    grupos.set(raizId, grupo);
    bytes += b;
    objetos += o;
  }

  const lista = [...grupos.values()].sort(maiorPrimeiro);
  for (const g of lista) g.edicoes.sort(maiorPrimeiro);
  return { bytes, objetos, projetos: lista };
}

/** Fatia do total, em porcentagem inteira para a barra (0 quando não há total). */
export function fatiaDoTotal(parte: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((parte / total) * 100)));
}
