import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: ComponentType<{ className?: string }>;
  title: ReactNode;
  /** O que fazer a seguir: criar o primeiro registro, ajustar os filtros… */
  description?: ReactNode;
  /** Botão da próxima ação (ex.: "Novo contrato"). */
  action?: ReactNode;
  /** Sem borda tracejada quando já está dentro de um card. */
  bordered?: boolean;
  className?: string;
}

/**
 * Estado vazio padrão das listas: diz o que está vazio e qual o próximo passo,
 * em vez de só "Nenhum registro".
 */
export const EmptyState = ({ icon: Icon, title, description, action, bordered = true, className }: EmptyStateProps) => (
  <div
    className={cn(
      "flex flex-col items-center justify-center px-6 py-12 text-center",
      bordered && "rounded-lg border border-dashed bg-card",
      className,
    )}
  >
    {Icon && (
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Icon className="h-6 w-6 text-primary" aria-hidden />
      </div>
    )}
    <h3 className="font-semibold">{title}</h3>
    {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
    {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
  </div>
);
