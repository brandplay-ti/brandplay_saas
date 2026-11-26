import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/** Iniciais do nome (ou do e-mail) para o avatar da conta. */
function iniciais(nomeOuEmail: string): string {
  return (nomeOuEmail || "U")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * Avatar com o menu da conta (nome, e-mail e Sair). O mesmo nos cabeçalhos do
 * desktop e do celular. No desktop o nome aparece ao lado do avatar.
 */
export function ContaMenu() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const nome = user?.user_metadata?.full_name || user?.email || "";

  const sair = async () => {
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    navigate("/", { replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-2">
          <Avatar className="h-8 w-8" aria-hidden>
            <AvatarFallback className="bg-gradient-brand text-primary-foreground text-xs font-semibold">
              {iniciais(nome)}
            </AvatarFallback>
          </Avatar>
          {/* No celular só o avatar aparece; o nome continua sendo o rótulo do botão. */}
          <span className="sr-only md:not-sr-only text-sm font-medium">{nome || "Conta"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="text-sm font-medium">{user?.user_metadata?.full_name || "Usuário"}</span>
            <span className="text-xs text-muted-foreground font-normal truncate">{user?.email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={sair} className="text-destructive focus:text-destructive">
          <LogOut className="h-4 w-4 mr-2" /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
