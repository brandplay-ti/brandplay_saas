import { CommandMenu } from "@/components/CommandMenu";
import { NotificationsBell } from "@/components/notifications/NotificationsBell";
import { OrganizationSwitcher } from "@/components/organization/OrganizationSwitcher";
import { ContaMenu } from "@/components/layout/ContaMenu";

/**
 * Cabeçalho do painel no celular (MOB-01, plano-versao-mobile.md): 56px, a
 * organização ativa com nome à esquerda e busca, notificações e conta à
 * direita. O menu sai daqui e vai para o "Mais" da barra inferior.
 */
export function MobileHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-1 border-b border-border bg-background pl-2 pr-1">
      <div className="min-w-0 flex-1">
        <OrganizationSwitcher mostrarNome />
      </div>
      <div className="flex shrink-0 items-center">
        <CommandMenu />
        <NotificationsBell />
        <ContaMenu />
      </div>
    </header>
  );
}
