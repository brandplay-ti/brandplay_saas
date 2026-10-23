/**
 * Termo digitado na busca global, pronto para um filtro `ilike` do PostgREST.
 *
 * Vírgula, aspas e parênteses quebram a sintaxe do `.or()`; `%`, `_` e `*` virariam
 * curinga; a barra invertida escaparia o próximo caractere. Tudo isso vira
 * espaço. Menos de 2 caracteres não busca (`null`).
 */
export function termoDeBusca(entrada: string): string | null {
  const limpo = entrada.replace(/[,()%_*\\"]/g, " ").replace(/\s+/g, " ").trim();
  return limpo.length >= 2 ? limpo.slice(0, 60) : null;
}

/** Minúsculas e sem acento: "relatorio" acha "Relatórios". */
export const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Páginas cujo título ou grupo contém o termo; sem termo, todas. */
export function filtrarPaginas<T extends { title: string; grupo: string }>(paginas: T[], entrada: string): T[] {
  const termo = normalizar(entrada.trim());
  if (!termo) return paginas;
  return paginas.filter((p) => normalizar(`${p.grupo} ${p.title}`).includes(termo));
}
