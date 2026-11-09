// Máscaras dos campos de valor, de número e de data (`.claude/rules/frontend.md`,
// "Campos de valor e de data"). Funções puras: quem guarda o estado de digitação
// são `CurrencyInput`, `NumberInput` e `DateInput`. O que sai daqui para o
// formulário é sempre o formato de máquina — decimal com ponto ("1234.56") e ISO
// ("2026-03-12") —, então o que já era gravado no banco não muda.

import { parseNumberBR } from "@/lib/csvParse";

/** Parte inteira das colunas de dinheiro (`numeric(14,2)`). */
const MAX_DIGITOS_INTEIRO = 12;

/** Dígitos que um `number` guarda sem perder precisão. */
const MAX_DIGITOS_NUMERO = 15;

const soDigitos = (texto: string) => texto.replace(/\D/g, "");
const doisDigitos = (n: number) => String(n).padStart(2, "0");
const agruparMilhar = (inteiro: string) => inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

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
  return `R$ ${agruparMilhar(inteiro)},${fracao}`;
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

/**
 * Número com marcador de milhar: 1234.5 vira "1.234,5" (com `casas` decimais no
 * máximo). Serve para campo e para tela. Aceita número, decimal com ponto e
 * decimal brasileiro ("12,5"). Vazio, nulo ou inválido vira "".
 */
export function formatarNumero(valor: string | number | null | undefined, casas = 0): string {
  if (valor === null || valor === undefined || String(valor).trim() === "") return "";
  const numero = typeof valor === "number" ? valor : parseNumberBR(valor);
  if (numero === null || !Number.isFinite(numero)) return "";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas }).format(numero);
}

/**
 * Aplica o marcador de milhar enquanto se digita: "1234" vira "1.234". Com
 * `casas`, a vírgula (ou um ponto digitado por último, do teclado numérico)
 * abre os decimais: "1234," fica "1.234," para o próximo dígito entrar depois.
 */
export function mascararNumero(texto: string, casas = 0, negativo = false): string {
  const sinal = negativo && texto.trimStart().startsWith("-") ? "-" : "";
  const [bruto, ...decimais] = (casas > 0 ? texto.replace(/\.$/, ",") : texto).split(",");
  const inteiro = soDigitos(bruto).replace(/^0+(?=\d)/, "").slice(0, MAX_DIGITOS_NUMERO);
  if (casas === 0 || decimais.length === 0) return sinal + agruparMilhar(inteiro);
  return `${sinal}${agruparMilhar(inteiro || "0")},${soDigitos(decimais.join("")).slice(0, casas)}`;
}

/** Texto do campo para o formulário: "1.234,5" vira "1234.5". Sem dígitos, "". */
export function campoParaNumero(texto: string): string {
  const [bruto, decimais = ""] = texto.split(",");
  const inteiro = soDigitos(bruto);
  if (!inteiro && !decimais) return "";
  return `${texto.startsWith("-") ? "-" : ""}${inteiro || "0"}${decimais ? `.${decimais}` : ""}`;
}

/** O valor do formulário é o número que o campo já mostra? `b` vem de `campoParaNumero`. */
export function mesmoNumero(a: string | number | null | undefined, b: string): boolean {
  const vazio = a === null || a === undefined || String(a).trim() === "";
  if (vazio || b === "") return vazio && b === "";
  return (typeof a === "number" ? a : parseNumberBR(a)) === Number(b);
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
