/**
 * Filtros de listagem guardados no `localStorage` (issue #51).
 *
 * Cada tela guarda um objeto `{ campo: valor }` numa chave própria, separada
 * pelo escopo (a organização ativa, ou `plataforma` na área `/admin`). Filtro
 * é preferência de tela, não autorização: o que o usuário pode ler continua
 * decidido pela RLS.
 *
 * Só ficam guardados os campos diferentes do padrão. Valor salvo que não bate
 * com o tipo do padrão (ou com a lista de opções permitidas) é ignorado.
 */

export type ValorDeFiltro = string | number | boolean | string[];

const PREFIXO = "brandplay:filtros";

/** Chave da tela no escopo; `null` quando ainda não há escopo (organização carregando). */
export function chaveDosFiltros(escopo: string | null | undefined, tela: string): string | null {
  return escopo ? `${PREFIXO}:${escopo}:${tela}` : null;
}

function armazenamento(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function lerTodos(chave: string): Record<string, unknown> {
  try {
    const bruto = armazenamento()?.getItem(chave);
    if (!bruto) return {};
    const lido: unknown = JSON.parse(bruto);
    return lido && typeof lido === "object" && !Array.isArray(lido) ? (lido as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function mesmoTipo<T extends ValorDeFiltro>(valor: unknown, padrao: T): valor is T {
  if (Array.isArray(padrao)) return Array.isArray(valor) && valor.every((v) => typeof v === "string");
  if (typeof padrao === "number") return typeof valor === "number" && Number.isFinite(valor);
  return typeof valor === typeof padrao;
}

function iguais(a: ValorDeFiltro, b: ValorDeFiltro): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => v === b[i]);
  return a === b;
}

/** Valor salvo do campo, ou o padrão quando não há valor válido. */
export function lerFiltro<T extends ValorDeFiltro>(
  chave: string,
  campo: string,
  padrao: T,
  permitidos?: readonly T[],
): T {
  const salvo = lerTodos(chave)[campo];
  if (salvo === undefined || !mesmoTipo(salvo, padrao)) return padrao;
  if (permitidos && !permitidos.some((p) => iguais(p, salvo))) return padrao;
  return salvo;
}

/** Guarda o campo; igual ao padrão, remove (e apaga a chave se ficar vazia). */
export function gravarFiltro<T extends ValorDeFiltro>(chave: string, campo: string, valor: T, padrao: T): void {
  const store = armazenamento();
  if (!store) return;
  const todos = lerTodos(chave);
  if (iguais(valor, padrao)) delete todos[campo];
  else todos[campo] = valor;
  try {
    if (Object.keys(todos).length === 0) store.removeItem(chave);
    else store.setItem(chave, JSON.stringify(todos));
  } catch {
    /* armazenamento cheio ou bloqueado: o filtro só não fica salvo */
  }
}
