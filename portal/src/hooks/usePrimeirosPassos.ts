import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { montarGuia, type ContagensDosPassos, type GuiaDePrimeirosPassos } from "@/lib/primeirosPassos";

type Tabela =
  | "organization_brand_kits"
  | "sports_properties"
  | "sponsorship_tiers"
  | "sponsors"
  | "opportunities"
  | "proposals"
  | "contracts"
  | "deliveries"
  | "sponsor_portal_access";

/**
 * Guia de primeiros passos da organização ativa (lib/primeirosPassos.ts).
 * Só conta linhas: a RLS já limita ao que o membro pode ler, e uma tabela
 * que ele não lê só deixa o passo em aberto. Com erro em qualquer contagem o
 * guia não aparece (`guia` fica nulo), em vez de mostrar progresso errado.
 */
export function usePrimeirosPassos(): { guia: GuiaDePrimeirosPassos | null; carregando: boolean } {
  const { orgId, clientType, isAdmin, can, loading } = useOrganization();

  const contagens = useQuery({
    queryKey: ["primeiros-passos", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<ContagensDosPassos> => {
      const contagem = ({ count, error }: { count: number | null; error: unknown }) => {
        if (error) throw error;
        return count ?? 0;
      };
      const contar = async (tabela: Tabela) =>
        contagem(
          await supabase
            .from(tabela)
            .select("organization_id", { count: "exact", head: true })
            .eq("organization_id", orgId as string),
        );
      const contarMembrosAtivos = async () =>
        contagem(
          await supabase
            .from("organization_members")
            .select("organization_id", { count: "exact", head: true })
            .eq("organization_id", orgId as string)
            .eq("status", "ativo"),
        );
      const [kitDeMarca, projetos, cotas, patrocinadores, oportunidades, propostas, contratos, entregas, membros, acessosAoPortal] =
        await Promise.all([
          contar("organization_brand_kits"),
          contar("sports_properties"),
          contar("sponsorship_tiers"),
          contar("sponsors"),
          // A marca não lê o funil (bloqueio no banco); sem o passo, nem consulta.
          clientType === "marca" ? Promise.resolve(0) : contar("opportunities"),
          clientType === "marca" ? Promise.resolve(0) : contar("proposals"),
          contar("contracts"),
          contar("deliveries"),
          contarMembrosAtivos(),
          contar("sponsor_portal_access"),
        ]);
      return { kitDeMarca, projetos, cotas, patrocinadores, oportunidades, propostas, contratos, entregas, membros, acessosAoPortal };
    },
  });

  const guia = contagens.data && !loading ? montarGuia({ clientType, isAdmin, can }, contagens.data) : null;
  return { guia, carregando: loading || contagens.isLoading };
}
