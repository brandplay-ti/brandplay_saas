import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useOrganization } from "@/hooks/useOrganization";
import { chaveDosFiltros, gravarFiltro, lerFiltro, type ValorDeFiltro } from "@/lib/filtrosSalvos";

type Opcoes<T> = {
  /** Valores aceitos ao ler o salvo (selects com opções fixas). */
  permitidos?: readonly T[];
  /** Escopo da chave. Sem ele, a organização ativa. */
  escopo?: string;
};

/**
 * `useState` de um filtro de listagem, guardado no `localStorage` por
 * organização ativa (issue #51). Trocar de organização recarrega o valor
 * salvo para ela; enquanto não há organização, vale o padrão e nada é gravado.
 *
 * Como no `useState`, `useFiltroSalvo(tela, campo, "all")` tipa o filtro como
 * `string`; para uma união de opções, passe o tipo: `useFiltroSalvo<Status>(...)`.
 */
export function useFiltroSalvo(
  tela: string,
  campo: string,
  padrao: boolean,
  opcoes?: Opcoes<boolean>,
): [boolean, Dispatch<SetStateAction<boolean>>];
export function useFiltroSalvo<T>(
  tela: string,
  campo: string,
  padrao: T & ValorDeFiltro,
  opcoes?: Opcoes<T>,
): [T, Dispatch<SetStateAction<T>>];
export function useFiltroSalvo<T extends ValorDeFiltro>(
  tela: string,
  campo: string,
  padrao: T,
  opcoes: Opcoes<T> = {},
): [T, Dispatch<SetStateAction<T>>] {
  const { orgId } = useOrganization();
  const chave = chaveDosFiltros(opcoes.escopo ?? orgId, tela);

  // O padrão pode ser um literal novo a cada render (ex.: `[]`); só o valor importa.
  const padraoRef = useRef(padrao);
  useEffect(() => {
    padraoRef.current = padrao;
  });

  const ler = (c: string | null): T => (c ? lerFiltro(c, campo, padrao, opcoes.permitidos) : padrao);
  const [estado, setEstado] = useState(() => ({ chave, valor: ler(chave) }));

  // Escopo mudou (organização carregou ou foi trocada): relê no mesmo render.
  let atual = estado;
  if (estado.chave !== chave) {
    atual = { chave, valor: ler(chave) };
    setEstado(atual);
  }

  useEffect(() => {
    if (estado.chave) gravarFiltro(estado.chave, campo, estado.valor, padraoRef.current);
  }, [estado, campo]);

  const setValor = useCallback<Dispatch<SetStateAction<T>>>((acao) => {
    setEstado((anterior) => ({
      chave: anterior.chave,
      valor: typeof acao === "function" ? (acao as (v: T) => T)(anterior.valor) : acao,
    }));
  }, []);

  return [atual.valor, setValor];
}
