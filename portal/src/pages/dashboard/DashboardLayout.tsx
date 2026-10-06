import { Outlet, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AIAssistantTrigger } from "@/components/ai/AIAssistantTrigger";
import { NotificationsBell } from "@/components/notifications/NotificationsBell";
import { OrganizationSwitcher } from "@/components/organization/OrganizationSwitcher";
import { OrganizationProvider } from "@/hooks/useOrganization";

const DashboardLayoutInner = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    navigate("/", { replace: true });
  };

  const initials = (user?.user_metadata?.full_name || user?.email || "U")
    .split(" ")
    .map((s: string) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-surface-soft">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 flex items-center justify-between border-b border-border bg-background px-4 md:px-6 sticky top-0 z-30">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <Logo showWordmark={false} sizeClassName="h-9 w-9 md:hidden" />
            </div>
            <div className="flex items-center gap-1">
              <OrganizationSwitcher />
              <NotificationsBell />
              <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-gradient-brand text-primary-foreground text-xs font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden md:inline text-sm font-medium">
                    {user?.user_metadata?.full_name || user?.email}
                  </span>
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
                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4 mr-2" /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-8">
            <Outlet />
          </main>
        </div>
        <AIAssistantTrigger />
      </div>
    </SidebarProvider>
  );
};

const DashboardLayout = () => (
  <OrganizationProvider>
    <DashboardLayoutInner />
  </OrganizationProvider>
);

export default DashboardLayout;
