import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { GlobalErrorReporter } from "@/components/GlobalErrorReporter";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import OrganizationSetup from "./pages/onboarding/OrganizationSetup";
import PublicMediaKit from "./pages/PublicMediaKit";
import DashboardLayout from "./pages/dashboard/DashboardLayout";
import Dashboard from "./pages/dashboard/Dashboard";
import Properties from "./pages/dashboard/Properties";
import PropertyDetail from "./pages/dashboard/PropertyDetail";
import Pipeline from "./pages/dashboard/Pipeline";
import Deliveries from "./pages/dashboard/Deliveries";
import Contracts from "./pages/dashboard/Contracts";
import Finance from "./pages/dashboard/Finance";
import Assets from "./pages/dashboard/Assets";
import Sponsors from "./pages/dashboard/Sponsors";
import SponsorDetail from "./pages/dashboard/SponsorDetail";
import Proposals from "./pages/dashboard/Proposals";
import LeadScoring from "./pages/dashboard/LeadScoring";
import Reports from "./pages/dashboard/Reports";
import Notifications from "./pages/dashboard/Notifications";
import CalendarPage from "./pages/dashboard/Calendar";
import PortalAccess from "./pages/dashboard/PortalAccess";
import Settings from "./pages/dashboard/Settings";
import Team from "./pages/dashboard/Team";
import FailureLogs from "./pages/dashboard/FailureLogs";
import BrandTrackLayout from "./pages/dashboard/brandtrack/BrandTrackLayout";
import BrandTrackDashboard from "./pages/dashboard/brandtrack/BrandTrackDashboard";
import BrandTrackUploads from "./pages/dashboard/brandtrack/BrandTrackUploads";
import BrandTrackBrands from "./pages/dashboard/brandtrack/BrandTrackBrands";
import BrandTrackBrandDetail from "./pages/dashboard/brandtrack/BrandTrackBrandDetail";
import BrandTrackExpectedBrands from "./pages/dashboard/brandtrack/BrandTrackExpectedBrands";
import BrandTrackEvidence from "./pages/dashboard/brandtrack/BrandTrackEvidence";
import BrandTrackReports from "./pages/dashboard/brandtrack/BrandTrackReports";
import PortalLayout from "./pages/portal/PortalLayout";
import PortalLogin from "./pages/portal/PortalLogin";
import PortalDeliveries from "./pages/portal/PortalDeliveries";
import PortalContracts from "./pages/portal/PortalContracts";
import PortalReports from "./pages/portal/PortalReports";
import { ProtectedRoute } from "./components/ProtectedRoute";
import FieldLayout from "./pages/field/FieldLayout";
import FieldDeliveries from "./pages/field/FieldDeliveries";
import FieldDeliveryDetail from "./pages/field/FieldDeliveryDetail";
import FieldEvents from "./pages/field/FieldEvents";
import FieldEventChecklist from "./pages/field/FieldEventChecklist";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <GlobalErrorReporter />
        <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
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
          <Route path="/campo" element={<FieldLayout />}>
            <Route index element={<FieldDeliveries />} />
            <Route path="entregas/:id" element={<FieldDeliveryDetail />} />
            <Route path="eventos" element={<FieldEvents />} />
            <Route path="eventos/:id" element={<FieldEventChecklist />} />
          </Route>
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
