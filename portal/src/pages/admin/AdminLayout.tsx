import { Link, Outlet, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Building2, LayoutDashboard, Loader2, LogOut, Package, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsPlatformAdmin } from "@/hooks/usePlatformAdmin";

const NAV = [
  { title: "Visão geral", to: "/admin", icon: LayoutDashboard, end: true },
  { title: "Clientes", to: "/admin/clientes", icon: Building2, end: false },
  { title: "Planos", to: "/admin/planos", icon: Package, end: false },
  { title: "Faturamento", to: "/admin/faturamento", icon: BarChart3, end: false },
];

/**
 * Área administrativa da plataforma (ADR-0008). A guarda aqui é experiência:
 * quem não é superadmin vê o aviso em vez de telas vazias. A fronteira é o
 * banco — as funções `admin_*` recusam e as policies não devolvem nada.
 */
const AdminLayout = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isPlatformAdmin, loading, error } = useIsPlatformAdmin();

  // O link para o painel só aparece para quem também é membro de alguma
  // organização; o superadmin da plataforma não precisa ser.
  const temOrganizacao = useQuery({
    queryKey: ["admin", "has-organization", user?.id ?? null],
    enabled: !!user && isPlatformAdmin,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { count, error: erro } = await supabase
        .from("organization_members")
        .select("organization_id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("status", "ativo");
      if (erro) throw erro;
      return (count ?? 0) > 0;
    },
  });

  const sair = async () => {
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    navigate("/", { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-soft">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Verificando acesso" />
      </div>
    );
  }

  if (error || !isPlatformAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-soft p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <ShieldAlert className="h-8 w-8 text-destructive mb-2" />
            <CardTitle>Acesso restrito</CardTitle>
            <CardDescription>
              {error
                ? "Não foi possível verificar o acesso. Tente recarregar a página."
                : "A administração da plataforma é exclusiva da equipe do BrandPlay."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/dashboard">Ir para o painel</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-soft">
      <header className="sticky top-0 z-30 border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 md:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <Logo showWordmark={false} sizeClassName="h-9 w-9" />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight">Administração da plataforma</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {temOrganizacao.data && (
              <Button variant="ghost" size="sm" asChild>
                <Link to="/dashboard">Painel da organização</Link>
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={sair} className="gap-2">
              <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
        <nav aria-label="Administração" className="mx-auto max-w-7xl overflow-x-auto px-2 md:px-4">
          <ul className="flex gap-1">
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className="flex items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  activeClassName="border-primary text-foreground font-medium"
                >
                  <item.icon className="h-4 w-4" />
                  {item.title}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="mx-auto max-w-7xl p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
