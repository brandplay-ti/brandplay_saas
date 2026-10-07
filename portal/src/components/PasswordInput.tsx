import { forwardRef, useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<ComponentProps<typeof Input>, "type">;

/**
 * Campo de senha do portal: começa oculto e tem um botão para mostrar/ocultar.
 * Todo campo de senha usa este componente (`.claude/rules/frontend.md`,
 * "Campos de senha").
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, disabled, ...props }, ref) => {
    const [visivel, setVisivel] = useState(false);

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visivel ? "text" : "password"}
          className={cn("pr-10", className)}
          disabled={disabled}
          {...props}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setVisivel((v) => !v)}
          disabled={disabled}
          aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
          className="absolute right-0 top-0 h-full rounded-l-none text-muted-foreground hover:bg-transparent hover:text-foreground"
        >
          {visivel ? <EyeOff /> : <Eye />}
        </Button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";
