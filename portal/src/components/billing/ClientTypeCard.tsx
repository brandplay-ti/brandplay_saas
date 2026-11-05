import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientTypeField } from "@/components/organization/ClientTypeField";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { TIPOS_DE_CLIENTE, type TipoDeCliente } from "@/lib/permissoes";

/**
 * Tipo de cliente na contratação (decisão D10): o proprietário confere e
 * corrige enquanto a organização não tem assinatura. Depois, só o suporte. O
 * banco (`corrigir_tipo_de_cliente`) aplica a mesma regra.
 */
export const ClientTypeCard = ({ hasSubscription }: { hasSubscription: boolean }) => {
  const { orgId, role, clientType, refresh } = useOrganization();
  const [escolha, setEscolha] = useState<TipoDeCliente>(clientType);
  useEffect(() => setEscolha(clientType), [clientType]);

  const podeCorrigir = role === "owner" && !hasSubscription;
  const atual = TIPOS_DE_CLIENTE.find((t) => t.key === clientType);

  const corrigir = useMutation({
    mutationFn: async (tipo: TipoDeCliente) => {
      const { error } = await supabase.rpc("corrigir_tipo_de_cliente", { _org_id: orgId!, _tipo: tipo });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Tipo de cliente atualizado.");
      await refresh();
    },
    onError: (erro: Error) => toast.error(erro.message || "Não foi possível corrigir o tipo de cliente."),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tipo de cliente: {atual?.label}</CardTitle>
        <CardDescription>
          {clientType === "marca"
            ? "Na visão de Marca não há funil de vendas nem captação de patrocinadores."
            : "A agência tem o funil de vendas, as propostas e a captação pelo media kit."}{" "}
          {podeCorrigir
            ? "Confira antes de contratar: depois da contratação, a troca é feita pelo suporte."
            : "Para trocar, fale com o suporte."}
        </CardDescription>
      </CardHeader>
      {podeCorrigir && (
        <CardContent className="space-y-3">
          <ClientTypeField value={escolha} onChange={setEscolha} disabled={corrigir.isPending} idPrefix="plano-tipo" />
          <Button
            size="sm"
            disabled={escolha === clientType || corrigir.isPending || !orgId}
            onClick={() => corrigir.mutate(escolha)}
          >
            {corrigir.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar tipo
          </Button>
        </CardContent>
      )}
    </Card>
  );
};
