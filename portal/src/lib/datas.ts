/**
 * Converte um valor de data vindo do banco em `Date`, respeitando o fuso local
 * quando o valor é uma data pura.
 *
 * Colunas `date` do Postgres (`due_date`, `start_date`, `end_date`, ...) chegam
 * como `"2026-11-02"`. `new Date("2026-11-02")` interpreta isso como meia-noite
 * **UTC**, que no Brasil (UTC-3) é 21h do dia anterior: a tela mostrava
 * 01/11 para um prazo de 02/11, e comparações de atraso viravam um dia antes.
 *
 * Aqui, `AAAA-MM-DD` vira meia-noite local. Qualquer outro formato (timestamp
 * com hora, `Date`, número) segue exatamente como `new Date(valor)`, então o
 * helper é seguro também para colunas `timestamptz` de mesmo nome.
 */
export function dataLocal(valor: string | number | Date | null | undefined): Date {
  if (typeof valor === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  return new Date(valor as string);
}
