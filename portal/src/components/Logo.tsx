import { BrandLogoArt, BrandMarkArt } from "@/components/brand/BrandArt";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  /** true: logo horizontal (símbolo + "Brandplay"); false: só o símbolo. */
  showWordmark?: boolean;
  /** Classe de altura do Tailwind (a largura acompanha a proporção). Padrão: h-8. */
  sizeClassName?: string;
  /** "brand": roxo do logo, para fundos claros. "white": versão negativa, para fundos roxos/escuros. */
  tone?: "brand" | "white";
}

export const Logo = ({ className, showWordmark = true, sizeClassName, tone = "brand" }: LogoProps) => {
  const Art = showWordmark ? BrandLogoArt : BrandMarkArt;
  return (
    <Art
      className={cn("w-auto shrink-0", tone === "white" ? "text-white" : "text-brand", sizeClassName ?? "h-8", className)}
    />
  );
};
