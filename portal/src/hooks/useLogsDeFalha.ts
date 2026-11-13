import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  buscaDeUsuario,
  filtroDeCliente,
  type FalhaDeBanco,
  type FalhaDeTela,
} from "@/lib/logsDeFalha";

// Logs de falha da plataforma (BP-3). A RLS (0045) só devolve linhas ao
// superadmin; este hook não é fronteira de segurança.

/** Quantas falhas a tela mostra por vez, das mais recentes. */
export const LIMITE_DE_FALHAS = 100;

export interface FiltrosDeFalhaDeBanco {
  cliente: string;
  usuario: string;
  tabela: string;
  acao: string;
}

export interface FiltrosDeFalhaDeTela {
  cliente: string;
  usuario: string;
  severidade: string;
}

export const logsDeFalhaKeys = {
  banco: (f: FiltrosDeFalhaDeBanco) => ["admin", "logs-falhas", "banco", f] as const,
  tela: (f: FiltrosDeFalhaDeTela) => ["admin", "logs-falhas", "tela", f] as const,
};

/** Falhas de banco registradas por `log-db-error`. */
export function useFalhasDeBanco(filtros: FiltrosDeFalhaDeBanco) {
  return useQuery({
    queryKey: logsDeFalhaKeys.banco(filtros),
    staleTime: 15_000,
    queryFn: async (): Promise<FalhaDeBanco[]> => {
      let query = supabase
        .from("backend_error_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(LIMITE_DE_FALHAS);

      const cliente = filtroDeCliente(filtros.cliente);
      if (cliente.tipo === "organizacao") query = query.eq("organization_id", cliente.id);
      if (cliente.tipo === "sem-organizacao") query = query.is("organization_id", null);
      if (filtros.tabela !== "todas") query = query.eq("table_name", filtros.tabela);
      if (filtros.acao !== "todas") query = query.eq("action", filtros.acao);
      const usuario = buscaDeUsuario(filtros.usuario);
      if (usuario?.coluna === "user_id") query = query.eq("user_id", usuario.valor);
      if (usuario?.coluna === "user_email") query = query.ilike("user_email", usuario.valor);

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Falhas de tela registradas por `report-error` (ErrorBoundary e erros globais). */
export function useFalhasDeTela(filtros: FiltrosDeFalhaDeTela) {
  return useQuery({
    queryKey: logsDeFalhaKeys.tela(filtros),
    staleTime: 15_000,
    queryFn: async (): Promise<FalhaDeTela[]> => {
      let query = supabase
        .from("error_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(LIMITE_DE_FALHAS);

      const cliente = filtroDeCliente(filtros.cliente);
      if (cliente.tipo === "organizacao") query = query.eq("organization_id", cliente.id);
      if (cliente.tipo === "sem-organizacao") query = query.is("organization_id", null);
      if (filtros.severidade !== "todas") query = query.eq("severity", filtros.severidade);
      const usuario = buscaDeUsuario(filtros.usuario);
      if (usuario?.coluna === "user_id") query = query.eq("user_id", usuario.valor);
      if (usuario?.coluna === "user_email") query = query.ilike("user_email", usuario.valor);

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
}
