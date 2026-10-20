import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Ícone lucide ao lado do título, na cor da marca. */
  icon?: ComponentType<{ className?: string }>;
  /** Botões e filtros da página, alinhados à direita no desktop. */
  actions?: ReactNode;
  className?: string;
}

/**
 * Cabeçalho padrão das páginas internas: título em Poppins (regra de `h1` no
 * `index.css`), descrição e ações. Um só tamanho de título em todo o app.
 */
export const PageHeader = ({ title, description, icon: Icon, actions, className }: PageHeaderProps) => (
  <div className={cn("flex flex-col gap-4 md:flex-row md:items-end md:justify-between", className)}>
    <div className="min-w-0">
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl">
        {Icon && <Icon className="h-6 w-6 shrink-0 text-primary" aria-hidden />}
        <span className="min-w-0 break-words">{title}</span>
      </h1>
      {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground md:text-base">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);
