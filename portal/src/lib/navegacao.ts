import { moduloDisponivel, type TipoDeCliente } from "@/lib/permissoes";
import { LayoutDashboard, Trophy, Boxes, Briefcase, FileText, FileSignature, FileBarChart, Truck, Wallet, BarChart3, Users, UserCog, ShieldCheck, Settings as SettingsIcon, Sparkles, Camera, Eye, Upload, Tag, ListChecks, Image as ImageIcon, AlertTriangle, Bell, CalendarDays, CreditCard, ShieldEllipsis, Presentation } from "lucide-react";

/**
 * Menu do painel: fonte única para a barra lateral (`AppSidebar`) e para a
 * busca global (`CommandMenu`). `modules` diz quais módulos dão acesso ao item;
 * sem `modules`, qualquer membro vê. Esconder um item é só experiência: quem
 * barra o acesso é a RLS.
 */

export type NavModule = "crm" | "vendas" | "operacional" | "financeiro" | "team";
export type NavItem = { title: string; url: string; icon: typeof BarChart3; modules?: NavModule[] };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
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
      { title: "Pipeline", url: "/dashboard/pipeline", icon: Briefcase, modules: ["vendas"] },
      { title: "Propostas", url: "/dashboard/propostas", icon: FileText, modules: ["vendas"] },
      { title: "Patrocinadores", url: "/dashboard/patrocinadores", icon: Users, modules: ["crm"] },
      { title: "Lead Scoring IA", url: "/dashboard/lead-scoring", icon: Sparkles, modules: ["vendas"] },
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
      { title: "App de Campo", url: "/campo", icon: Camera, modules: ["operacional", "crm"] },
    ],
  },
  {
    label: "BrandTrack",
    items: [
      { title: "Painel BrandTrack", url: "/dashboard/brandtrack", icon: Eye },
      { title: "Uploads", url: "/dashboard/brandtrack/uploads", icon: Upload },
      { title: "Marcas esperadas", url: "/dashboard/brandtrack/marcas-esperadas", icon: ListChecks },
      { title: "Análise por patrocinador", url: "/dashboard/brandtrack/marcas", icon: Tag },
      { title: "Evidências", url: "/dashboard/brandtrack/evidencias", icon: ImageIcon },
      { title: "Relatórios BrandTrack", url: "/dashboard/brandtrack/relatorios", icon: FileBarChart },
    ],
  },
  {
    label: "Reports",
    items: [
      { title: "Relatórios", url: "/dashboard/relatorios", icon: BarChart3 },
      { title: "Relatórios de resultado", url: "/dashboard/relatorios/paginas", icon: Presentation, modules: ["crm", "operacional"] },
    ],
  },
  {
    label: "Administração",
    items: [
      { title: "Equipe", url: "/dashboard/equipe", icon: UserCog, modules: ["team"] },
      { title: "Acessos ao Portal", url: "/dashboard/portal-access", icon: ShieldCheck, modules: ["team"] },
      { title: "Logs de Falhas", url: "/dashboard/logs-falhas", icon: AlertTriangle, modules: ["team"] },
      { title: "Configurações", url: "/dashboard/configuracoes", icon: SettingsIcon, modules: ["team"] },
      { title: "Plano e cobrança", url: "/dashboard/plano", icon: CreditCard, modules: ["team"] },
    ],
  },
];

/**
 * Rótulos que mudam na visão de Marca (decisão D3): o patrocinador é a
 * própria marca, ou as marcas do grupo.
 */
const TITULOS_DA_MARCA: Record<string, string> = {
  "/dashboard/patrocinadores": "Marcas",
};

interface Acesso {
  can: (module: NavModule) => boolean;
  /** Tipo de cliente da organização ativa; sem ele, agência. */
  clientType?: TipoDeCliente;
  isAdmin: boolean;
  /** Enquanto os papéis carregam, mostra tudo (evita o menu "piscar" vazio). */
  loading: boolean;
  isPlatformAdmin: boolean;
}

/** Grupos e itens que o usuário pode ver, mais o atalho do superadmin. */
export function gruposVisiveis({ can, clientType = "agencia", loading, isPlatformAdmin }: Acesso): NavGroup[] {
  // O teto por tipo vale mesmo durante o carregamento: o funil nunca pisca para a marca.
  const visivel = (item: NavItem) =>
    !item.modules ||
    item.modules.some((m) => moduloDisponivel(clientType, m) && (loading || can(m)));
  const titulo = (item: NavItem) =>
    clientType === "marca" && TITULOS_DA_MARCA[item.url] ? { ...item, title: TITULOS_DA_MARCA[item.url] } : item;
  const grupos = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter(visivel).map(titulo) })).filter(
    (g) => g.items.length > 0,
  );
  if (isPlatformAdmin) {
    grupos.push({ label: "Plataforma", items: [{ title: "Admin da plataforma", url: "/admin", icon: ShieldEllipsis }] });
  }
  return grupos;
}

/**
 * Item ativo: só o de URL mais longa que contém a rota atual. Com prefixo
 * simples, "Painel BrandTrack" (/dashboard/brandtrack) ficava aceso junto com
 * qualquer subpágina do BrandTrack.
 */
export function urlAtiva(grupos: NavGroup[], pathname: string): string | null {
  return grupos
    .flatMap((g) => g.items.map((i) => i.url))
    .filter((url) => pathname === url || pathname.startsWith(`${url}/`))
    .reduce<string | null>((melhor, url) => (melhor && melhor.length >= url.length ? melhor : url), null);
}
