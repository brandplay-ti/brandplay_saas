import { useOrganization } from "@/hooks/useOrganization";
import { gruposVisiveis, urlAtiva } from "@/lib/navegacao";
import { useIsPlatformAdmin } from "@/hooks/usePlatformAdmin";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

export const AppSidebar = () => {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { can, isAdmin, loading } = useOrganization();
  // Só o atalho: a área /admin se protege sozinha (layout + banco).
  const { isPlatformAdmin } = useIsPlatformAdmin();

  const visibleGroups = gruposVisiveis({ can, isAdmin, loading, isPlatformAdmin });
  const activeUrl = urlAtiva(visibleGroups, location.pathname);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border h-20 flex items-center justify-center px-4">
        {collapsed ? (
          <Logo showWordmark={false} sizeClassName="h-7" />
        ) : (
          <Logo sizeClassName="h-8" />
        )}
      </SidebarHeader>
      <SidebarContent>
        {visibleGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = item.url === activeUrl;
                  return (
                    <SidebarMenuItem key={item.url}>
                      {/* O tooltip só aparece com a barra recolhida (só ícones). */}
                      <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                        <NavLink
                          to={item.url}
                          className={cn("flex items-center gap-2", isActive && "text-primary")}
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
};
