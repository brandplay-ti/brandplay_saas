// Desconto comercial do superadmin (0035).
//
// 100% no prazo é a isenção. O prazo é de 1 a 12 meses, contados da criação
// da linha em meses de calendário (UTC). A validação mora aqui para o teste
// não precisar do Stripe.

export class DescontoInvalido extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DescontoInvalido";
  }
}

export interface DescontoValido {
  percentOff: number;
  durationMonths: number;
  comment: string;
}

export function validarDesconto(input: {
  percent_off: unknown;
  duration_months: unknown;
  comment: unknown;
}): DescontoValido {
  const percent = input.percent_off;
  if (typeof percent !== "number" || !Number.isInteger(percent) || percent < 1 || percent > 100) {
    throw new DescontoInvalido("O desconto vai de 1% a 100%. 100% isenta a cobrança no prazo.");
  }
  const months = input.duration_months;
  if (typeof months !== "number" || !Number.isInteger(months) || months < 1 || months > 12) {
    throw new DescontoInvalido("O prazo do desconto vai de 1 a 12 meses.");
  }
  return {
    percentOff: percent,
    durationMonths: months,
    comment: validarComentario(input.comment),
  };
}

export function validarComentario(comment: unknown): string {
  if (typeof comment !== "string" || comment.trim().length < 3) {
    throw new DescontoInvalido("Informe o motivo (ao menos 3 caracteres).");
  }
  return comment.trim();
}

/** Ainda dentro de `durationMonths` meses de calendário a partir de `createdAt`. */
export function descontoAindaVigente(createdAt: string, durationMonths: number, agora = Date.now()): boolean {
  const inicio = new Date(createdAt);
  if (Number.isNaN(inicio.getTime())) return false;
  if (!Number.isInteger(durationMonths) || durationMonths < 1) return false;
  const fim = new Date(inicio);
  fim.setUTCMonth(fim.getUTCMonth() + durationMonths);
  return fim.getTime() > agora;
}
