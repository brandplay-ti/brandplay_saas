// Máscaras dos campos de valor e de data (`.claude/rules/frontend.md`, "Campos
// de valor e de data"). Funções puras: quem guarda o estado de digitação são
// `CurrencyInput` e `DateInput`. O que sai daqui para o formulário é sempre o
// formato de máquina — decimal com ponto ("1234.56") e ISO ("2026-03-12") —,
// então o que já era gravado no banco não muda.

import { parseNumberBR } from "@/lib/csvParse";

/** Parte inteira das colunas de dinheiro (`numeric(14,2)`). */
const MAX_DIGITOS_INTEIRO = 12;

const soDigitos = (texto: string) => texto.replace(/\D/g, "");
const doisDigitos = (n: number) => String(n).padStart(2, "0");

/**
 * Valor do formulário para o texto do campo: 1234.5 vira "R$ 1.234,50".
 * Aceita número, decimal com ponto e decimal brasileiro ("490,00"). Vazio, nulo,
 * negativo ou inválido vira "".
 */
export function moedaParaCampo(valor: string | number | null | undefined, casas = 2): string {
  if (valor === null || valor === undefined || String(valor).trim() === "") return "";
  const numero = typeof valor === "number" ? valor : parseNumberBR(valor);
  if (numero === null || !Number.isFinite(numero) || numero < 0) return "";
  const [inteiro, fracao] = numero.toFixed(casas).split(".");
  return `R$ ${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${fracao}`;
}

/**
 * Texto do campo para decimal, preenchendo da direita para a esquerda: os
 * dígitos "123456" viram "1234.56". Sem dígitos, "".
 */
export function campoParaDecimal(texto: string, casas = 2): string {
  const digitos = soDigitos(texto);
  if (!digitos) return "";
  const completo = digitos.padStart(casas + 1, "0");
  const inteiro = completo.slice(0, -casas).replace(/^0+(?=\d)/, "");
  return `${inteiro}.${completo.slice(-casas)}`;
}

/** O decimal cabe nas colunas de dinheiro? */
export function moedaCabeNoLimite(decimal: string): boolean {
  return decimal.split(".")[0].length <= MAX_DIGITOS_INTEIRO;
}

/** Quantos dígitos o campo de data aceita: ddmmaaaa, mais hhmm com hora. */
export const limiteDigitosData = (comHora = false) => (comHora ? 12 : 8);

/**
 * Aplica a máscara enquanto se digita: "12032026" vira "12/03/2026" e, com
 * hora, "120320261430" vira "12/03/2026 14:30". A barra só entra quando há
 * dígito depois dela, para o backspace não ficar preso nela. Aceita colar ISO.
 */
export function mascararData(texto: string, comHora = false): string {
  const iso = /^\s*(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(texto);
  const digitos = iso
    ? `${iso[3]}${iso[2]}${iso[1]}${iso[4] ?? ""}${iso[5] ?? ""}`
    : soDigitos(
        // Digitando "1/3/2026", a barra depois de um dígito só quer dizer 01/03.
        // Só no fim do texto: no meio, "2/03/2026" é quem está corrigindo o dia.
        texto
          .replace(/^(\d)\/$/, (_, dia: string) => `0${dia}/`)
          .replace(/^(\d{2}\/)(\d)\/$/, (_, dia: string, mes: string) => `${dia}0${mes}/`),
      );
  const d = digitos.slice(0, limiteDigitosData(comHora));
  let saida = d.slice(0, 2);
  if (d.length > 2) saida += `/${d.slice(2, 4)}`;
  if (d.length > 4) saida += `/${d.slice(4, 8)}`;
  if (d.length > 8) saida += ` ${d.slice(8, 10)}`;
  if (d.length > 10) saida += `:${d.slice(10, 12)}`;
  return saida;
}

/** Texto do campo para ISO. Incompleto ou data que não existe (31/02) vira "". */
export function dataParaIso(texto: string, comHora = false): string {
  const m = (comHora ? /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/ : /^(\d{2})\/(\d{2})\/(\d{4})$/).exec(texto);
  if (!m) return "";
  const [dia, mes, ano] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const data = new Date(ano, mes - 1, dia);
  if (ano < 1900 || data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) return "";
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  if (!comHora) return iso;
  return Number(m[4]) > 23 || Number(m[5]) > 59 ? "" : `${iso}T${m[4]}:${m[5]}`;
}

/**
 * ISO para dd/mm/aaaa (com hora, dd/mm/aaaa hh:mm). Lê o texto em vez de passar
 * por `Date`, para uma data sem hora não voltar um dia no fuso do Brasil. Serve
 * também para exibir data pura em tela.
 */
export function isoParaData(iso: string | null | undefined, comHora = false): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(iso ?? "");
  if (!m) return "";
  const data = `${m[3]}/${m[2]}/${m[1]}`;
  return comHora ? `${data} ${m[4] ?? "00"}:${m[5] ?? "00"}` : data;
}

/** Texto dd/mm/aaaa de um `Date`, no fuso de quem usa (dia escolhido no calendário). */
export const dateParaData = (d: Date) => `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}/${d.getFullYear()}`;

/** Depois de reaplicar a máscara, em que posição fica o cursor que tinha N dígitos à esquerda. */
export function posicaoAposDigitos(mascarado: string, digitos: number): number {
  if (digitos <= 0) return 0;
  let vistos = 0;
  for (let i = 0; i < mascarado.length; i++) {
    if (/\d/.test(mascarado[i]) && ++vistos === digitos) return i + 1;
  }
  return mascarado.length;
}
