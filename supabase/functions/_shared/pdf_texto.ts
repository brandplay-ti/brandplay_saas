// Quebra de texto para os PDFs gerados com pdf-lib (proposta, contrato).
//
// Regra do produto: nenhum texto de documento é cortado com "…". Tudo que não
// cabe na largura disponível desce para a linha seguinte. A medida é a largura
// real do texto na fonte, não a contagem de caracteres: "MMMM" e "iiii" têm o
// mesmo número de letras e larguras bem diferentes.

/** O que a fonte do pdf-lib oferece para medir texto (PDFFont). */
export interface MedidorDeTexto {
  widthOfTextAtSize(texto: string, tamanho: number): number;
}

/**
 * Divide `texto` em linhas que cabem em `larguraMax` pontos na fonte e tamanho
 * informados. Respeita as quebras de linha do próprio texto e quebra palavras
 * que sozinhas não cabem (URL, código longo). Texto vazio devolve `[]`.
 */
export function quebrarTexto(
  texto: string | null | undefined,
  fonte: MedidorDeTexto,
  tamanho: number,
  larguraMax: number,
): string[] {
  const bruto = String(texto ?? "");
  if (!bruto.trim()) return [];

  const cabe = (s: string) => fonte.widthOfTextAtSize(s, tamanho) <= larguraMax;
  const linhas: string[] = [];

  for (const paragrafo of bruto.split(/\r?\n/)) {
    const palavras = paragrafo.split(/[ \t]+/).filter(Boolean);
    if (palavras.length === 0) {
      linhas.push("");
      continue;
    }

    let atual = "";
    for (const palavra of palavras) {
      const candidata = atual ? `${atual} ${palavra}` : palavra;
      if (cabe(candidata)) {
        atual = candidata;
        continue;
      }
      if (atual) linhas.push(atual);
      atual = "";

      if (cabe(palavra)) {
        atual = palavra;
        continue;
      }
      // Palavra maior que a linha inteira: quebra por caractere.
      let pedaco = "";
      for (const ch of Array.from(palavra)) {
        if (pedaco && !cabe(pedaco + ch)) {
          linhas.push(pedaco);
          pedaco = ch;
        } else {
          pedaco += ch;
        }
      }
      atual = pedaco;
    }
    if (atual) linhas.push(atual);
  }

  // Linhas em branco no começo e no fim não acrescentam nada ao documento.
  while (linhas.length && linhas[0] === "") linhas.shift();
  while (linhas.length && linhas[linhas.length - 1] === "") linhas.pop();
  return linhas;
}
