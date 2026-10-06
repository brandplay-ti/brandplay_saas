import { LayoutDashboard, Trophy, Boxes, Briefcase, FileText, FileSignature, Truck, Wallet, BarChart3, Users, ShieldCheck, Settings as SettingsIcon, Sparkles, Camera, Eye, Upload, Tag, Image as ImageIcon, AlertTriangle, Bell, CalendarDays } from "lucide-react";
import { useOrganization } from "@/hooks/useOrganization";
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

type NavItem = { title: string; url: string; icon: typeof BarChart3; modules?: ("crm" | "operacional" | "financeiro" | "team")[] };
type NavGroup = { label: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Visão Geral",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
      { title: "Calendário", url: "/dashboard/calendario", icon: CalendarDays },
      { title: "Notificações", url: "/dashboard/notificacoes", icon: Bell },
    ],
  },
  {
    label: "CRM",
    items: [
      { title: "Pipeline", url: "/dashboard/pipeline", icon: Briefcase, modules: ["crm"] },
      { title: "Propostas", url: "/dashboard/propostas", icon: FileText, modules: ["crm"] },
      { title: "Patrocinadores", url: "/dashboard/patrocinadores", icon: Users, modules: ["crm"] },
      { title: "Lead Scoring IA", url: "/dashboard/lead-scoring", icon: Sparkles, modules: ["crm"] },
    ],
  },
  {
    label: "Deals",
    items: [
      { title: "Contratos", url: "/dashboard/contratos", icon: FileSignature, modules: ["crm", "financeiro"] },
      { title: "Financeiro", url: "/dashboard/financeiro", icon: Wallet, modules: ["financeiro"] },
    ],
  },
  {
    label: "Plays",
    items: [
      { title: "Propriedades", url: "/dashboard/propriedades", icon: Trophy, modules: ["crm", "operacional"] },
      { title: "Ativos", url: "/dashboard/ativos", icon: Boxes, modules: ["crm", "operacional"] },
    ],
  },
  {
    label: "Delivery",
    items: [
      { title: "Entregas", url: "/dashboard/entregas", icon: Truck, modules: ["operacional", "crm"] },
      { title: "App de Campo 📸", url: "/campo", icon: Camera, modules: ["operacional", "crm"] },
    ],
  },
  {
    label: "BrandTrack",
    items: [
      { title: "Visão Geral", url: "/dashboard/brandtrack", icon: Eye },
      { title: "Uploads", url: "/dashboard/brandtrack/uploads", icon: Upload },
      { title: "Marcas esperadas", url: "/dashboard/brandtrack/marcas-esperadas", icon: Sparkles },
      { title: "Patrocinadores", url: "/dashboard/brandtrack/marcas", icon: Tag },
      { title: "Evidências", url: "/dashboard/brandtrack/evidencias", icon: ImageIcon },
      { title: "Relatórios", url: "/dashboard/brandtrack/relatorios", icon: FileText },
    ],
  },
  {
    label: "Reports",
    items: [
      { title: "Relatórios", url: "/dashboard/relatorios", icon: BarChart3 },
    ],
  },
  {
    label: "Admin",
    items: [
      { title: "Equipe", url: "/dashboard/equipe", icon: Users, modules: ["team"] },
      { title: "Acessos ao Portal", url: "/dashboard/portal-access", icon: ShieldCheck, modules: ["team"] },
      { title: "Logs de Falhas", url: "/dashboard/logs-falhas", icon: AlertTriangle, modules: ["team"] },
      { title: "Configurações", url: "/dashboard/configuracoes", icon: SettingsIcon, modules: ["team"] },
    ],
  },
];

export const AppSidebar = () => {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { can, isAdmin, loading } = useOrganization();

  const filterItem = (item: NavItem) => {
    if (!item.modules) return true;
    if (loading) return true;
    if (isAdmin) return true;
    return item.modules.some((m) => can(m));
  };

  const visibleGroups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter(filterItem) }))
    .filter((g) => g.items.length > 0);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border h-20 flex items-center justify-center px-4">
        {collapsed ? (
          <Logo showWordmark={false} sizeClassName="h-12 w-12" />
        ) : (
          <Logo sizeClassName="h-14" />
        )}
      </SidebarHeader>
      <SidebarContent>
        {visibleGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive =
                    item.url === "/dashboard"
                      ? location.pathname === "/dashboard"
                      : location.pathname.startsWith(item.url);
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild isActive={isActive}>
                        <NavLink
                          to={item.url}
                          end={item.url === "/dashboard"}
                          className="flex items-center gap-2"
                          activeClassName="text-primary"
                        >
                          <item.icon className="h-4 w-4" />
                          {!collapsed && <span>{item.title}</span>}
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
