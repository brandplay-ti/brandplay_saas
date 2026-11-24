// Árvore de pastas da mídia da edição (BP-7.04, D12). Regras puras, sem
// React nem Supabase. As mesmas regras valem no banco (0049,
// `tg_midia_edicao_regras`); aqui elas só evitam mandar algo que o banco
// vai recusar e dão a mensagem certa na tela.

export type PastaDaEdicao = {
  id: string;
  name: string;
  parent_folder_id: string | null;
  archived_at: string | null;
};

export type MidiaNaPasta = {
  id: string;
  folder_id: string | null;
  archived_at: string | null;
};

export const NOME_DA_PASTA_MAX = 120;

const porNome = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base", numeric: true });

/** Pastas diretamente dentro de `paiId` (`null` = raiz da edição), em ordem de nome. */
export function filhasDe<T extends PastaDaEdicao>(pastas: T[], paiId: string | null): T[] {
  return pastas.filter((p) => p.parent_folder_id === paiId).sort(porNome);
}

/**
 * Caminho da raiz até a pasta, inclusive. Pasta que não existe na lista dá
 * caminho vazio; uma cadeia quebrada ou com ciclo para no ponto em que
 * quebra, em vez de girar.
 */
export function caminhoAte<T extends PastaDaEdicao>(pastas: T[], pastaId: string | null): T[] {
  if (!pastaId) return [];
  const porId = new Map(pastas.map((p) => [p.id, p]));
  const caminho: T[] = [];
  const vistas = new Set<string>();
  let atual = porId.get(pastaId);
  while (atual && !vistas.has(atual.id)) {
    vistas.add(atual.id);
    caminho.unshift(atual);
    atual = atual.parent_folder_id ? porId.get(atual.parent_folder_id) : undefined;
  }
  return caminho;
}

/** Ids da pasta e de tudo que está abaixo dela. */
export function subarvore(pastas: PastaDaEdicao[], pastaId: string): Set<string> {
  const ids = new Set<string>([pastaId]);
  let cresceu = true;
  while (cresceu) {
    cresceu = false;
    for (const p of pastas) {
      if (p.parent_folder_id && ids.has(p.parent_folder_id) && !ids.has(p.id)) {
        ids.add(p.id);
        cresceu = true;
      }
    }
  }
  return ids;
}

export type PastaComNivel<T> = T & { nivel: number };

/** Árvore achatada em ordem de leitura (pasta, depois as filhas), com o nível. */
export function arvoreAchatada<T extends PastaDaEdicao>(pastas: T[]): PastaComNivel<T>[] {
  const ids = new Set(pastas.map((p) => p.id));
  const saida: PastaComNivel<T>[] = [];
  const vistas = new Set<string>();
  const visitar = (paiId: string | null, nivel: number) => {
    for (const p of pastas.filter((x) => (x.parent_folder_id && ids.has(x.parent_folder_id) ? x.parent_folder_id : null) === paiId).sort(porNome)) {
      if (vistas.has(p.id)) continue;
      vistas.add(p.id);
      saida.push({ ...p, nivel });
      visitar(p.id, nivel + 1);
    }
  };
  visitar(null, 0);
  return saida;
}

/**
 * Para onde a pasta pode ir: a raiz (`null`) ou outra pasta ativa que não
 * esteja dentro dela, nem seja a mãe atual (mover para o mesmo lugar não
 * muda nada).
 */
export function destinosDaPasta<T extends PastaDaEdicao>(pastas: T[], pastaId: string): Array<PastaComNivel<T> | null> {
  const pasta = pastas.find((p) => p.id === pastaId);
  if (!pasta) return [];
  const bloqueadas = subarvore(pastas, pastaId);
  const ativas = pastas.filter((p) => !p.archived_at);
  const destinos: Array<PastaComNivel<T> | null> = [];
  if (pasta.parent_folder_id !== null) destinos.push(null);
  for (const p of arvoreAchatada(ativas)) {
    if (!bloqueadas.has(p.id) && p.id !== pasta.parent_folder_id) destinos.push(p);
  }
  return destinos;
}

/** Para onde um arquivo pode ir: raiz ou qualquer pasta ativa, menos a atual. */
export function destinosDaMidia<T extends PastaDaEdicao>(pastas: T[], pastaAtual: string | null): Array<PastaComNivel<T> | null> {
  const destinos: Array<PastaComNivel<T> | null> = [];
  if (pastaAtual !== null) destinos.push(null);
  for (const p of arvoreAchatada(pastas.filter((x) => !x.archived_at))) {
    if (p.id !== pastaAtual) destinos.push(p);
  }
  return destinos;
}

/**
 * Valida o nome de uma pasta nova ou renomeada. Devolve a mensagem de erro
 * ou `null`. `irmas` são as pastas do mesmo nível; `proprioId` é a pasta
 * sendo renomeada (o nome atual dela não conta como repetido).
 */
export function erroNoNomeDaPasta(nome: string, irmas: PastaDaEdicao[], proprioId?: string): string | null {
  const limpo = nome.trim();
  if (!limpo) return "Dê um nome à pasta.";
  if (limpo.length > NOME_DA_PASTA_MAX) return `Use até ${NOME_DA_PASTA_MAX} caracteres.`;
  // eslint-disable-next-line no-control-regex -- recusa caractere de controle, como o banco
  if (/[\u0000-\u001f\u007f]/.test(limpo)) return "O nome tem um caractere inválido.";
  const repetida = irmas.some(
    (p) => p.id !== proprioId && !p.archived_at && p.name.toLocaleLowerCase("pt-BR") === limpo.toLocaleLowerCase("pt-BR"),
  );
  if (repetida) return "Já existe uma pasta com esse nome aqui.";
  return null;
}

export type ConteudoParaArquivar = {
  /** Pastas ativas da subárvore, das mais fundas para a de cima (a ordem que o banco aceita). */
  pastas: string[];
  /** Arquivos ativos dentro da subárvore. */
  midias: string[];
};

function profundidade(pastas: PastaDaEdicao[], id: string): number {
  return caminhoAte(pastas, id).length;
}

/**
 * O que precisa ser arquivado, e em que ordem, para arquivar a pasta: o banco
 * só arquiva pasta vazia, então primeiro os arquivos, depois as pastas de
 * baixo para cima.
 */
export function conteudoParaArquivar(pastas: PastaDaEdicao[], midias: MidiaNaPasta[], pastaId: string): ConteudoParaArquivar {
  const ids = subarvore(pastas, pastaId);
  const ativas = pastas.filter((p) => ids.has(p.id) && !p.archived_at);
  ativas.sort((a, b) => profundidade(pastas, b.id) - profundidade(pastas, a.id));
  return {
    pastas: ativas.map((p) => p.id),
    midias: midias.filter((m) => m.folder_id && ids.has(m.folder_id) && !m.archived_at).map((m) => m.id),
  };
}

/**
 * O que volta do arquivo junto com a pasta: as pastas arquivadas da subárvore
 * de cima para baixo (a mãe precisa estar ativa antes da filha) e os arquivos
 * arquivados dentro dela. A pasta-mãe da pasta pedida precisa estar ativa.
 */
export function conteudoParaDesarquivar(pastas: PastaDaEdicao[], midias: MidiaNaPasta[], pastaId: string): ConteudoParaArquivar {
  const ids = subarvore(pastas, pastaId);
  const arquivadas = pastas.filter((p) => ids.has(p.id) && p.archived_at);
  arquivadas.sort((a, b) => profundidade(pastas, a.id) - profundidade(pastas, b.id));
  return {
    pastas: arquivadas.map((p) => p.id),
    midias: midias.filter((m) => m.folder_id && ids.has(m.folder_id) && m.archived_at).map((m) => m.id),
  };
}

/** A pasta-mãe está arquivada: a pasta não pode sair do arquivo antes dela. */
export function maeArquivada(pastas: PastaDaEdicao[], pastaId: string): boolean {
  const pasta = pastas.find((p) => p.id === pastaId);
  if (!pasta?.parent_folder_id) return false;
  return !!pastas.find((p) => p.id === pasta.parent_folder_id)?.archived_at;
}

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
