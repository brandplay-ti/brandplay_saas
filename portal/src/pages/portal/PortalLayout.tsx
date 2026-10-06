import { Link, NavLink, Navigate, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSponsorAccess } from "@/hooks/useSponsorAccess";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Briefcase, FileText, FolderKanban, LogOut, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

const navItems = [
  { to: "/portal", end: true, label: "Entregas", icon: FolderKanban },
  { to: "/portal/contratos", label: "Contratos", icon: FileText },
  { to: "/portal/relatorios", label: "Relatórios", icon: Briefcase },
];

export default function PortalLayout() {
  const { user, loading } = useAuth();
  const { accesses, loading: accessLoading, hasAccess } = useSponsorAccess();
  const navigate = useNavigate();

  if (loading || accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-hero">
        <Logo showWordmark={false} sizeClassName="h-16 w-16" />
      </div>
    );
  }

  if (!user) return <Navigate to="/portal/login" replace />;

  if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <ShieldCheck className="h-12 w-12 text-muted-foreground mx-auto" />
          <h1 className="text-xl font-semibold">Acesso pendente</h1>
          <p className="text-sm text-muted-foreground">
            Sua conta foi criada, mas ainda não foi vinculada a um patrocinador. Aguarde a aprovação ou
            entre em contato com a propriedade.
          </p>
          <Button
            variant="outline"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate("/portal/login");
            }}
          >
            Sair
          </Button>
        </div>
      </div>
    );
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    navigate("/portal/login");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Link to="/portal" className="flex items-center gap-2">
            <Logo showWordmark={false} sizeClassName="h-9 w-9" />
            <div className="leading-tight">
              <p className="text-xs text-muted-foreground">Portal</p>
              <p className="text-sm font-semibold">Patrocinador</p>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="hidden sm:inline-flex">
              {accesses[0]?.sponsor_name}
              {accesses.length > 1 && ` +${accesses.length - 1}`}
            </Badge>
            <span
              className="hidden md:inline text-sm text-muted-foreground max-w-[220px] truncate"
              title={user.email ?? undefined}
            >
              {user.email}
            </span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" /> Sair
            </Button>
          </div>
        </div>
        <nav className="container mx-auto px-4 flex gap-1 overflow-x-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2.5 text-sm border-b-2 transition-colors ${
                  isActive
                    ? "border-primary text-foreground font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="flex-1 container mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
