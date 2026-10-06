import logo from "@/assets/brandplay-logo.png";
import mark from "@/assets/brandplay-mark.png";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  showWordmark?: boolean;
  /** Tailwind sizing class. Defaults to h-12 (wordmark) or h-10 w-10 (icon). */
  sizeClassName?: string;
}

export const Logo = ({ className, showWordmark = true, sizeClassName }: LogoProps) => {
  if (showWordmark) {
    return (
      <div className={cn("flex items-center", className)}>
        <img
          src={logo}
          alt="BrandPlay"
          className={cn("w-auto", sizeClassName ?? "h-12")}
        />
      </div>
    );
  }

  return (
    <img
      src={mark}
      alt="BrandPlay"
      className={cn("object-contain", sizeClassName ?? "h-10 w-10", className)}
    />
  );
};
