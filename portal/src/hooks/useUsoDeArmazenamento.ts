import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resumirUso, type ResumoDoUso } from "@/lib/armazenamento";

// Uso de armazenamento da organização ativa (BP-7.17). A view
// `edition_storage_usage` respeita a RLS de quem consulta (`security_invoker`):
// o filtro por organização aqui só escolhe qual delas mostrar.

export const usoDeArmazenamentoKeys = {
  resumo: (orgId: string | null) => ["armazenamento", "resumo", orgId] as const,
};

export function useUsoDeArmazenamento(orgId: string | null) {
  return useQuery({
    queryKey: usoDeArmazenamentoKeys.resumo(orgId),
    enabled: !!orgId,
    queryFn: async (): Promise<ResumoDoUso> => {
      const { data: linhas, error } = await supabase
        .from("edition_storage_usage")
        .select("property_id, total_bytes, object_count")
        .eq("organization_id", orgId!);
      if (error) throw error;
      if (!linhas || linhas.length === 0) return resumirUso([], []);

      // Nomes dos projetos e das edições, para agrupar pela raiz.
      const { data: projetos, error: erroProjetos } = await supabase
        .from("sports_properties")
        .select("id, name, parent_property_id")
        .eq("organization_id", orgId!);
      if (erroProjetos) throw erroProjetos;
      return resumirUso(linhas, projetos ?? []);
    },
  });
}
