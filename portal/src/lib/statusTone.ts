/**
 * Tons de estado da identidade visual. Toda cor de status (badge, chip,
 * ponto de etapa, ícone de categoria) sai daqui, nunca de uma cor crua do
 * Tailwind (`emerald-600`, `amber-500`...), para que a paleta da marca e o
 * contraste AA fiquem num lugar só (`src/index.css`).
 *
 * - success: concluído, ativo, pago, aprovado, ganho
 * - warning: aguardando, vencendo, em revisão, atenção
 * - danger: atrasado, cancelado, perdido, erro
 * - info: em andamento, enviado, agendado
 * - brand: destaque da marca, categorias comerciais
 * - neutral: rascunho, inativo, sem dado
 */
export type StatusTone = "success" | "warning" | "danger" | "info" | "brand" | "neutral";

/** Fundo suave + texto + borda, para badges e chips. */
export const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  success: "bg-success/15 text-success-strong border-success/30",
  warning: "bg-warning/15 text-warning-strong border-warning/30",
  danger: "bg-destructive/10 text-destructive border-destructive/30",
  info: "bg-info/10 text-info-strong border-info/30",
  brand: "bg-primary/10 text-primary border-primary/30",
  neutral: "bg-muted text-muted-foreground border-border",
};

/** Cor sólida, para pontos e barras de etapa. */
export const STATUS_TONE_DOT: Record<StatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info",
  brand: "bg-primary",
  neutral: "bg-muted-foreground",
};

/** Cor de texto/ícone sobre fundo neutro (card, linha de tabela). */
export const STATUS_TONE_TEXT: Record<StatusTone, string> = {
  success: "text-success-strong",
  warning: "text-warning-strong",
  danger: "text-destructive",
  info: "text-info-strong",
  brand: "text-primary",
  neutral: "text-muted-foreground",
};
