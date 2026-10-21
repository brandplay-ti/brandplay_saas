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
  // flex-wrap: com muitas ações, elas descem para a linha de baixo em vez de
  // espremer o título (com flex-row puro o título quebrava letra por letra).
  <div className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-4", className)}>
    <div className="min-w-0 max-w-full">
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl">
        {Icon && <Icon className="h-6 w-6 shrink-0 text-primary" aria-hidden />}
        <span className="min-w-0 break-words">{title}</span>
      </h1>
      {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground md:text-base">{description}</p>}
    </div>
    {/* [&>div]:flex-wrap: as páginas agrupam os botões num <div className="flex">
        próprio; sem quebra, a fileira passava da borda em telas estreitas. */}
    {actions && <div className="flex flex-wrap items-center gap-2 [&>div]:flex-wrap">{actions}</div>}
  </div>
);
