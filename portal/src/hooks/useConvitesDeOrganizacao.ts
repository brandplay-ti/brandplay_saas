import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { PapelDePermissao } from "@/lib/permissoes";

/** Convite pendente para o e-mail da conta logada (0041). */
export type ConviteDeOrganizacao = {
  id: string;
  organization_id: string;
  organization_name: string;
  role: PapelDePermissao;
  invited_by_name: string | null;
  expires_at: string;
};

/**
 * Convites de organização da conta logada, com aceitar e recusar. A
 * autorização é do banco: as funções só agem sobre convite do e-mail
 * confirmado de `auth.uid()`.
 */
export function useConvitesDeOrganizacao() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const chave = ["convites-de-organizacao", user?.id] as const;

  const convites = useQuery({
    queryKey: chave,
    enabled: !!user,
    // O onboarding espera esta consulta antes de seguir: sem novas tentativas,
    // uma falha não atrasa o login.
    retry: false,
    queryFn: async (): Promise<ConviteDeOrganizacao[]> => {
      const { data, error } = await supabase.rpc("convites_de_organizacao_pendentes");
      if (error) throw error;
      return data ?? [];
    },
  });

  const atualizar = () => queryClient.invalidateQueries({ queryKey: chave });

  const aceitar = useMutation({
    mutationFn: async (conviteId: string): Promise<string> => {
      const { data, error } = await supabase.rpc("aceitar_convite_de_organizacao", { _invite_id: conviteId });
      if (error) throw error;
      return data;
    },
    onSettled: atualizar,
  });

  const recusar = useMutation({
    mutationFn: async (conviteId: string): Promise<void> => {
      const { error } = await supabase.rpc("recusar_convite_de_organizacao", { _invite_id: conviteId });
      if (error) throw error;
    },
    onSettled: atualizar,
  });

  return { convites, aceitar, recusar };
}
