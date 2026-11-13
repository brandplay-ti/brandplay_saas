import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { usePlatformRole } from "@/hooks/usePlatformAdmin";

/**
 * Rota da área `/admin` que é só do superadmin (visão geral, planos,
 * faturamento, IA, equipe). O Suporte (0046) volta para a lista de clientes.
 * Experiência apenas: as funções do banco recusam o Suporte do mesmo jeito.
 */
export const SomenteSuperadmin = ({ children }: { children: ReactNode }) => {
  const { isPlatformAdmin, loading } = usePlatformRole();
  if (loading) return null;
  if (!isPlatformAdmin) return <Navigate to="/admin/clientes" replace />;
  return <>{children}</>;
};
