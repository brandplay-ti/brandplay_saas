import { useState } from "react";
import { Building2, Check, ChevronsUpDown, Eye, Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  useActiveSupportSession,
  useAdminClients,
  useEnterClient,
  useLeaveClient,
  usePlatformRole,
} from "@/hooks/usePlatformAdmin";
import { cn } from "@/lib/utils";

const ACTIVE_ORG_KEY = "active_organization_id";

function guardarOrganizacaoAtiva(orgId: string | null) {
  try {
    if (orgId) localStorage.setItem(ACTIVE_ORG_KEY, orgId);
    else localStorage.removeItem(ACTIVE_ORG_KEY);
  } catch {
    // Sem armazenamento local o painel abre na primeira organização disponível.
  }
}

/**
 * Seletor de cliente da equipe da plataforma (BP-4), como no central-check.
 * Sem cliente selecionado, a pessoa está na visão de admin (`/admin`). Ao
 * escolher um cliente, abre uma sessão de suporte (8 h, auditada) e o painel
 * dele carrega como se o admin do cliente estivesse logado. "Voltar à visão de
 * admin" encerra a sessão. A fronteira é o banco (`admin_abrir_sessao_suporte`
 * e `is_org_member`/`has_org_role` da 0035): este componente é só o atalho.
 */
export const ClientSelector = ({
  className,
  labelClassName,
}: {
  className?: string;
  /** Ex.: esconder o texto em tela estreita; o `aria-label` continua descrevendo o botão. */
  labelClassName?: string;
}) => {
  const { isPlatformStaff } = usePlatformRole();
  const [aberto, setAberto] = useState(false);
  const sessao = useActiveSupportSession(isPlatformStaff);
  const clientes = useAdminClients(isPlatformStaff && aberto);
  const entrar = useEnterClient();
  const sair = useLeaveClient();

  if (!isPlatformStaff) return null;

  const atual = sessao.data ?? null;
  const ocupado = entrar.isPending || sair.isPending;

  const escolher = async (orgId: string) => {
    setAberto(false);
    try {
      if (atual?.organization_id !== orgId) await entrar.mutateAsync(orgId);
      guardarOrganizacaoAtiva(orgId);
      // Recarrega para o painel montar a organização e as permissões da sessão.
      window.location.assign("/dashboard");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível abrir o cliente.");
    }
  };

  const voltar = async () => {
    setAberto(false);
    if (!atual) return;
    try {
      await sair.mutateAsync(atual.id);
      try {
        if (localStorage.getItem(ACTIVE_ORG_KEY) === atual.organization_id) guardarOrganizacaoAtiva(null);
      } catch {
        // idem
      }
      window.location.assign("/admin");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível voltar à visão de admin.");
    }
  };

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={atual ? "secondary" : "outline"}
          size="sm"
          role="combobox"
          aria-expanded={aberto}
          aria-label={atual ? `Cliente selecionado: ${atual.organization_name}. Trocar cliente` : "Selecionar cliente"}
          className={cn("justify-between gap-2 min-w-0", className)}
          disabled={ocupado}
        >
          {ocupado ? <Loader2 className="animate-spin" /> : atual ? <Eye /> : <Building2 />}
          <span className={cn("truncate flex-1 text-left", labelClassName)}>
            {atual ? `Cliente: ${atual.organization_name}` : "Selecionar cliente"}
          </span>
          <ChevronsUpDown className={cn("opacity-50", labelClassName)} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar cliente..." />
          <CommandList>
            <CommandEmpty>{clientes.isLoading ? "Carregando clientes..." : "Nenhum cliente encontrado."}</CommandEmpty>
            {atual && (
              <>
                <CommandGroup>
                  <CommandItem value="Voltar à visão de admin" onSelect={voltar}>
                    <Undo2 /> Voltar à visão de admin
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            <CommandGroup heading="Clientes">
              {(clientes.data ?? []).map((c) => (
                <CommandItem
                  key={c.organization_id}
                  value={`${c.name} ${c.owner_email ?? ""} ${c.organization_id}`}
                  onSelect={() => escolher(c.organization_id)}
                >
                  <Check className={cn(atual?.organization_id === c.organization_id ? "opacity-100" : "opacity-0")} />
                  <div className="min-w-0">
                    <p className="truncate">{c.name}</p>
                    {c.owner_email && <p className="truncate text-xs text-muted-foreground">{c.owner_email}</p>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
