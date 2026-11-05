import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { PageLoader } from "@/components/PageLoader";
import { useOrganization } from "@/hooks/useOrganization";
import type { ModuloDePermissao } from "@/lib/permissoes";

/**
 * Rota do painel que só existe com o módulo: sem ele (papel sem acesso ou
 * marca sem o funil), volta ao Dashboard. Experiência só; a RLS já devolve vazio.
 */
export const ModuleRoute = ({ module, children }: { module: ModuloDePermissao; children: ReactNode }) => {
  const { can, loading } = useOrganization();
  if (loading) return <PageLoader />;
  if (!can(module)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};
