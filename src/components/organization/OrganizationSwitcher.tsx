import { useMemo } from "react";
import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import { CreateOrganizationDialog } from "./CreateOrganizationDialog";

const useLogoUrl = (path?: string | null) =>
  useMemo(() => {
    if (!path) return null;
    return supabase.storage.from("org-logos").getPublicUrl(path).data.publicUrl;
  }, [path]);

export const OrganizationSwitcher = () => {
  const { orgId, orgName, orgLogoPath, organizations, switchOrganization, loading } = useOrganization();
  const currentLogo = useLogoUrl(orgLogoPath);

  if (loading || !orgId) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-2 max-w-[220px]">
          <Avatar className="h-7 w-7 rounded-md">
            {currentLogo ? <AvatarImage src={currentLogo} alt={orgName} className="object-contain" /> : null}
            <AvatarFallback className="rounded-md bg-muted text-[10px]">
              <Building2 className="h-3.5 w-3.5" />
            </AvatarFallback>
          </Avatar>
          <span className="hidden sm:inline text-sm font-medium truncate">{orgName || "Organização"}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-60 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Suas organizações</DropdownMenuLabel>
        {organizations.map((org) => {
          const url = org.logo_path
            ? supabase.storage.from("org-logos").getPublicUrl(org.logo_path).data.publicUrl
            : null;
          const active = org.id === orgId;
          return (
            <DropdownMenuItem
              key={org.id}
              onClick={() => !active && switchOrganization(org.id)}
              className="gap-2"
            >
              <Avatar className="h-6 w-6 rounded-md">
                {url ? <AvatarImage src={url} alt={org.name} className="object-contain" /> : null}
                <AvatarFallback className="rounded-md bg-muted text-[10px]">
                  <Building2 className="h-3 w-3" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{org.name}</div>
                <div className="text-[10px] text-muted-foreground capitalize">{org.role}</div>
              </div>
              {active && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <CreateOrganizationDialog
          trigger={
            <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="gap-2">
              <Plus className="h-4 w-4" /> Nova organização
            </DropdownMenuItem>
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
