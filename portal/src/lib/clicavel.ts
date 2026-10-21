import type { KeyboardEvent } from "react";

/**
 * Elementos clicáveis que não são <button> (card, linha de tabela, item de
 * lista): sem isto, só funcionam com mouse. Ganham foco pelo Tab e ativação
 * por Enter e Espaço, como um botão.
 *
 * Prefira <button>/<Button> quando der. Use isto quando o elemento precisa
 * continuar sendo um card ou uma linha (layout, semântica de tabela).
 */

/** Enter ou Espaço no próprio elemento (não em um controle dentro dele). */
export const ativarComTeclado = (acao: () => void) => (e: KeyboardEvent) => {
  if (e.target !== e.currentTarget) return;
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    acao();
  }
};

/**
 * Props para um elemento clicável. Em linha de tabela (`linha: true`) não há
 * `role="button"`: isso tiraria a linha da estrutura da tabela para o leitor de
 * tela.
 */
export const clicavel = (acao: () => void, { linha = false }: { linha?: boolean } = {}) => ({
  ...(linha ? {} : { role: "button" as const }),
  tabIndex: 0,
  onClick: acao,
  onKeyDown: ativarComTeclado(acao),
});

/** Anel de foco para os elementos acima (os <button> já têm o seu). */
export const FOCO_CLICAVEL = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";
