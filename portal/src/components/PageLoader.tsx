import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Carregamento de página (chunk da rota). `fullScreen` fora dos layouts. */
export const PageLoader = ({ fullScreen = false }: { fullScreen?: boolean }) => (
  <div
    role="status"
    aria-live="polite"
    className={cn("flex items-center justify-center", fullScreen ? "min-h-screen" : "min-h-[40vh]")}
  >
    <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
    <span className="sr-only">Carregando…</span>
  </div>
);
