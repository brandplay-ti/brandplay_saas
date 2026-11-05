import { Repeat } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CommentedActionDialog } from "@/components/admin/CommentedActionDialog";
import { useAdminClientType, useChangeClientType } from "@/hooks/usePlatformAdmin";
import { TIPOS_DE_CLIENTE } from "@/lib/permissoes";

/**
 * Tipo de cliente no detalhe do cliente (0043). A troca não apaga nada: o
 * funil da agência que vira marca fica oculto e volta se ela voltar a ser
 * agência (decisão D11). As contagens mostram o que vai sumir.
 */
export const ClientTypeAdminCard = ({ orgId }: { orgId: string }) => {
  const tipo = useAdminClientType(orgId);
  const trocar = useChangeClientType(orgId);

  const atual = tipo.data?.client_type ?? "agencia";
  const destino = atual === "marca" ? "agencia" : "marca";
  const rotulo = (t: string) => TIPOS_DE_CLIENTE.find((x) => x.key === t)?.label ?? t;

  const impacto =
    destino === "marca" && tipo.data
      ? `Ficam ocultos, sem exclusão: ${tipo.data.open_opportunities} oportunidade(s) aberta(s), ${tipo.data.proposals} proposta(s), ${tipo.data.leads} lead(s). ${tipo.data.published_properties} media kit(s) publicado(s) saem do ar.`
      : "O funil de vendas, as propostas e o media kit voltam como estavam antes da troca.";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          Tipo de cliente
          {tipo.data && <Badge variant="secondary">{rotulo(atual)}</Badge>}
        </CardTitle>
        <CardDescription>
          {atual === "marca"
            ? "Marca: sem funil de vendas, propostas, lead scoring e media kit público."
            : "Agência: com funil de vendas, propostas e captação pelo media kit."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CommentedActionDialog
          trigger={
            <Button variant="outline" size="sm" disabled={!tipo.data}>
              <Repeat /> Trocar para {rotulo(destino)}
            </Button>
          }
          title={`Trocar para ${rotulo(destino)}`}
          description={impacto}
          confirmLabel="Trocar tipo"
          onConfirm={async ({ comment }) => {
            try {
              await trocar.mutateAsync({ clientType: destino, comment });
              toast.success(`Organização agora é ${rotulo(destino)}.`);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Não foi possível trocar o tipo.");
              throw e;
            }
          }}
        />
      </CardContent>
    </Card>
  );
};
