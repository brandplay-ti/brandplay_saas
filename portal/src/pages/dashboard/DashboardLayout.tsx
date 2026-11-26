import { Outlet } from "react-router-dom";
import { Suspense } from "react";
import { PageLoader } from "@/components/PageLoader";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Logo } from "@/components/Logo";
import { AIAssistantTrigger } from "@/components/ai/AIAssistantTrigger";
import { NotificationsBell } from "@/components/notifications/NotificationsBell";
import { OrganizationSwitcher } from "@/components/organization/OrganizationSwitcher";
import { CommandMenu } from "@/components/CommandMenu";
import { ContaMenu } from "@/components/layout/ContaMenu";
import { MobileHeader } from "@/components/layout/MobileHeader";
import { BottomNav } from "@/components/layout/BottomNav";
import { OrganizationProvider } from "@/hooks/useOrganization";
import { BillingGate } from "@/components/billing/BillingGate";
import { SupportSessionBanner } from "@/components/admin/SupportSessionBanner";

const DesktopHeader = () => (
  <header className="h-16 flex items-center justify-between border-b border-border bg-background px-4 md:px-6 sticky top-0 z-30">
    <div className="flex items-center gap-3">
      <SidebarTrigger />
      <Logo showWordmark={false} sizeClassName="h-8 md:hidden" />
      <CommandMenu />
    </div>
    <div className="flex items-center gap-1">
      <OrganizationSwitcher />
      <NotificationsBell />
      <ContaMenu />
    </div>
  </header>
);

/**
 * Casca do painel. No celular (abaixo de 768px, MOB-01) troca o cabeçalho
 * pelo `MobileHeader` e põe a `BottomNav`; a barra lateral continua lá, aberta
 * pelo "Mais". Decide por `isMobile`, não por CSS: com os dois cabeçalhos na
 * página, a busca (Ctrl+K) e as notificações ficariam registradas duas vezes.
 */
const Casca = () => {
  const { isMobile } = useSidebar();

  return (
    <div className="min-h-screen flex w-full bg-surface-soft">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {isMobile ? <MobileHeader /> : <DesktopHeader />}
        {/* pb-24 no celular: o conteúdo não fica embaixo da barra inferior (64px + área segura). */}
        <main className="flex-1 p-4 pb-24 md:p-8">
          <SupportSessionBanner />
          <BillingGate>
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </BillingGate>
        </main>
      </div>
      <AIAssistantTrigger />
      {isMobile && <BottomNav />}
    </div>
  );
};

const DashboardLayout = () => (
  <OrganizationProvider>
    <SidebarProvider>
      <Casca />
    </SidebarProvider>
  </OrganizationProvider>
);

export default DashboardLayout;
