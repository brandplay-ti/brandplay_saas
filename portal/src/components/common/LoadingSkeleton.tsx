import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Variante = "lista" | "cards" | "detalhe" | "quadro";

interface LoadingSkeletonProps {
  /** Formato do conteúdo que está carregando, para a tela não "pular" ao chegar. */
  variant?: Variante;
  /** Linhas (lista), cards (cards) ou colunas (quadro). */
  count?: number;
  className?: string;
}

/**
 * Carregamento de conteúdo no formato do que vai aparecer (linhas, cards,
 * colunas), no lugar de "Carregando…" ou de um spinner solto.
 */
export const LoadingSkeleton = ({ variant = "lista", count, className }: LoadingSkeletonProps) => (
  <div role="status" aria-busy="true" aria-live="polite" className={cn("w-full", className)}>
    <span className="sr-only">Carregando…</span>
    {variant === "lista" && (
      <div className="space-y-2">
        {Array.from({ length: count ?? 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-md border bg-card p-3">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="hidden h-6 w-20 sm:block" />
          </div>
        ))}
      </div>
    )}
    {variant === "cards" && (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count ?? 6 }, (_, i) => (
          <div key={i} className="space-y-3 rounded-lg border bg-card p-4">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    )}
    {variant === "detalhe" && (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-7 w-1/3" />
            <Skeleton className="h-4 w-1/4" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )}
    {variant === "quadro" && (
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: count ?? 4 }, (_, i) => (
          <div key={i} className="w-72 shrink-0 space-y-3 rounded-lg bg-muted/40 p-3">
            <Skeleton className="h-5 w-1/2" />
            {Array.from({ length: 3 }, (_, j) => (
              <Skeleton key={j} className="h-20 w-full" />
            ))}
          </div>
        ))}
      </div>
    )}
  </div>
);
