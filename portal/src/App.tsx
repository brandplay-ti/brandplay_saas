import { Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { GlobalErrorReporter } from "@/components/GlobalErrorReporter";
import { DocumentTitle } from "@/components/DocumentTitle";
import { ConfirmProvider } from "@/hooks/useConfirm";
import Landing from "./pages/Landing";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { PageLoader } from "@/components/PageLoader";
import { lazyPage } from "@/lib/lazyPage";

// Landing no pacote principal (primeira tela de quem chega); o resto, um chunk
// por página, carregado ao navegar.
const Auth = lazyPage(() => import("./pages/Auth"));
const EsqueciSenha = lazyPage(() => import("./pages/EsqueciSenha"));
const ResetarSenha = lazyPage(() => import("./pages/ResetarSenha"));
const OrganizationSetup = lazyPage(() => import("./pages/onboarding/OrganizationSetup"));
const PublicMediaKit = lazyPage(() => import("./pages/PublicMediaKit"));
const DashboardLayout = lazyPage(() => import("./pages/dashboard/DashboardLayout"));
const Dashboard = lazyPage(() => import("./pages/dashboard/Dashboard"));
const Properties = lazyPage(() => import("./pages/dashboard/Properties"));
const PropertyDetail = lazyPage(() => import("./pages/dashboard/PropertyDetail"));
const Pipeline = lazyPage(() => import("./pages/dashboard/Pipeline"));
const Deliveries = lazyPage(() => import("./pages/dashboard/Deliveries"));
const Contracts = lazyPage(() => import("./pages/dashboard/Contracts"));
const Finance = lazyPage(() => import("./pages/dashboard/Finance"));
const Assets = lazyPage(() => import("./pages/dashboard/Assets"));
const Sponsors = lazyPage(() => import("./pages/dashboard/Sponsors"));
const SponsorDetail = lazyPage(() => import("./pages/dashboard/SponsorDetail"));
const Proposals = lazyPage(() => import("./pages/dashboard/Proposals"));
const LeadScoring = lazyPage(() => import("./pages/dashboard/LeadScoring"));
const Reports = lazyPage(() => import("./pages/dashboard/Reports"));
const Notifications = lazyPage(() => import("./pages/dashboard/Notifications"));
const CalendarPage = lazyPage(() => import("./pages/dashboard/Calendar"));
const PortalAccess = lazyPage(() => import("./pages/dashboard/PortalAccess"));
const Settings = lazyPage(() => import("./pages/dashboard/Settings"));
const Team = lazyPage(() => import("./pages/dashboard/Team"));
const FailureLogs = lazyPage(() => import("./pages/dashboard/FailureLogs"));
const Plan = lazyPage(() => import("./pages/dashboard/Plan"));
const BrandTrackLayout = lazyPage(() => import("./pages/dashboard/brandtrack/BrandTrackLayout"));
const BrandTrackDashboard = lazyPage(() => import("./pages/dashboard/brandtrack/BrandTrackDashboard"));
const BrandTrackUploads = lazyPage(() => import("./pages/dashboard/brandtrack/BrandTrackUploads"));
const BrandTrackBrands = lazyPage(() => import("./pages/dashboard/brandtrack/BrandTrackBrands"));
const BrandTrackBrandDetail = lazyPage(() => import("./pages/dashboard/brandtrack/BrandTrackBrandDetail"));
const BrandTrackExpectedBrands = lazyPage(() => import("./pages/dashboard/brandtrack/BrandTrackExpectedBrands"));
const BrandTrackEvidence = lazyPage(() => import("./pages/dashboard/brandtrack/BrandTrackEvidence"));
const BrandTrackReports = lazyPage(() => import("./pages/dashboard/brandtrack/BrandTrackReports"));
const PortalLayout = lazyPage(() => import("./pages/portal/PortalLayout"));
const PortalLogin = lazyPage(() => import("./pages/portal/PortalLogin"));
const PortalDeliveries = lazyPage(() => import("./pages/portal/PortalDeliveries"));
const PortalContracts = lazyPage(() => import("./pages/portal/PortalContracts"));
const PortalReports = lazyPage(() => import("./pages/portal/PortalReports"));
const FieldLayout = lazyPage(() => import("./pages/field/FieldLayout"));
const FieldDeliveries = lazyPage(() => import("./pages/field/FieldDeliveries"));
const FieldDeliveryDetail = lazyPage(() => import("./pages/field/FieldDeliveryDetail"));
const FieldEvents = lazyPage(() => import("./pages/field/FieldEvents"));
const FieldEventChecklist = lazyPage(() => import("./pages/field/FieldEventChecklist"));
const AdminLayout = lazyPage(() => import("./pages/admin/AdminLayout"));
const AdminOverview = lazyPage(() => import("./pages/admin/AdminOverview"));
const AdminClients = lazyPage(() => import("./pages/admin/AdminClients"));
const AdminClientDetail = lazyPage(() => import("./pages/admin/AdminClientDetail"));
const AdminPlans = lazyPage(() => import("./pages/admin/AdminPlans"));
const AdminRevenue = lazyPage(() => import("./pages/admin/AdminRevenue"));
const AdminAi = lazyPage(() => import("./pages/admin/AdminAi"));
const AdminAiClientDetail = lazyPage(() => import("./pages/admin/AdminAiClientDetail"));
const AdminAiPrecos = lazyPage(() => import("./pages/admin/AdminAiPrecos"));
const NotFound = lazyPage(() => import("./pages/NotFound.tsx"));

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ConfirmProvider>
        {/* Tema fixo enquanto o app não tem modo escuro: com "system", o toast
            ficava escuro sobre a interface clara em quem usa o SO no escuro. */}
        <Sonner theme="light" />
        <GlobalErrorReporter />
        <BrowserRouter>
        <DocumentTitle />
        <Suspense fallback={<PageLoader fullScreen />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/esqueci-senha" element={<EsqueciSenha />} />
          <Route path="/resetar-senha" element={<ResetarSenha />} />
          <Route path="/onboarding/organizacao" element={<OrganizationSetup />} />
          <Route path="/p/:slug" element={<PublicMediaKit />} />
          <Route path="/portal/login" element={<PortalLogin />} />
          <Route path="/portal" element={<PortalLayout />}>
            <Route index element={<PortalDeliveries />} />
            <Route path="contratos" element={<PortalContracts />} />
            <Route path="relatorios" element={<PortalReports />} />
          </Route>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="propriedades" element={<Properties />} />
            <Route path="propriedades/:id" element={<PropertyDetail />} />
            <Route path="ativos" element={<Assets />} />
            <Route path="patrocinadores" element={<Sponsors />} />
            <Route path="patrocinadores/:id" element={<SponsorDetail />} />
            <Route path="propostas" element={<Proposals />} />
            <Route path="lead-scoring" element={<LeadScoring />} />
            <Route path="pipeline" element={<Pipeline />} />
            <Route path="entregas" element={<Deliveries />} />
            <Route path="contratos" element={<Contracts />} />
            <Route path="financeiro" element={<Finance />} />
            <Route path="relatorios" element={<Reports />} />
            <Route path="calendario" element={<CalendarPage />} />
            <Route path="notificacoes" element={<Notifications />} />
            <Route path="portal-access" element={<PortalAccess />} />
            <Route path="equipe" element={<Team />} />
            <Route path="logs-falhas" element={<FailureLogs />} />
            <Route path="configuracoes" element={<Settings />} />
            <Route path="plano" element={<Plan />} />
            <Route path="brandtrack" element={<BrandTrackLayout />}>
              <Route index element={<BrandTrackDashboard />} />
              <Route path="uploads" element={<BrandTrackUploads />} />
              <Route path="marcas" element={<BrandTrackBrands />} />
              <Route path="marcas-esperadas" element={<BrandTrackExpectedBrands />} />
              <Route path="marcas/:brand" element={<BrandTrackBrandDetail />} />
              <Route path="evidencias" element={<BrandTrackEvidence />} />
              <Route path="relatorios" element={<BrandTrackReports />} />
            </Route>
          </Route>
          {/* Administração da plataforma (superadmin, ADR-0008). A guarda do
              layout é experiência; quem barra é o banco. */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminOverview />} />
            <Route path="clientes" element={<AdminClients />} />
            <Route path="clientes/:id" element={<AdminClientDetail />} />
            <Route path="planos" element={<AdminPlans />} />
            <Route path="faturamento" element={<AdminRevenue />} />
            <Route path="ia" element={<AdminAi />} />
            <Route path="ia/clientes/:id" element={<AdminAiClientDetail />} />
            <Route path="ia/precos" element={<AdminAiPrecos />} />
          </Route>
          <Route path="/campo" element={<FieldLayout />}>
            <Route index element={<FieldDeliveries />} />
            <Route path="entregas/:id" element={<FieldDeliveryDetail />} />
            <Route path="eventos" element={<FieldEvents />} />
            <Route path="eventos/:id" element={<FieldEventChecklist />} />
          </Route>
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
        </BrowserRouter>
        </ConfirmProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
