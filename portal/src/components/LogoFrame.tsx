import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type LogoFrameSize = "xs" | "sm" | "md" | "lg" | "xl";

/** Tamanhos e espaçamentos padronizados dos containers de logo do BrandPlay. */
const sizeMap: Record<LogoFrameSize, { box: string; pad: string; icon: string }> = {
  xs: { box: "h-8 w-8", pad: "p-1", icon: "h-3.5 w-3.5" },
  sm: { box: "h-10 w-10", pad: "p-1.5", icon: "h-4 w-4" },
  md: { box: "h-12 w-12", pad: "p-1.5", icon: "h-5 w-5" },
  lg: { box: "h-16 w-16", pad: "p-2", icon: "h-6 w-6" },
  xl: { box: "h-20 w-20", pad: "p-2.5", icon: "h-7 w-7" },
};

export const logoFrameIconClass = (size: LogoFrameSize = "md") => sizeMap[size].icon;

interface LogoFrameProps {
  src?: string | null;
  alt?: string;
  size?: LogoFrameSize;
  className?: string;
  /** Conteúdo exibido quando não há logo (ícone, iniciais, etc). */
  fallback?: ReactNode;
}

export const LogoFrame = ({ src, alt = "", size = "md", className, fallback }: LogoFrameProps) => {
  const s = sizeMap[size];
  return (
    <div
      className={cn(
        "shrink-0 flex items-center justify-center overflow-hidden rounded-md border bg-muted",
        s.box,
        s.pad,
        className,
      )}
    >
      {src ? (
        <img src={src} alt={alt} className="h-full w-full object-contain" loading="lazy" />
      ) : (
        fallback
      )}
    </div>
  );
};
