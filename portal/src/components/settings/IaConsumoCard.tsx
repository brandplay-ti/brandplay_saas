import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";

interface ConsumoIa {
  ia_habilitada?: boolean;
  orcamento_cents?: number | null;
  alerta_pct?: number;
  gasto_mes_brl?: number;
  pct_usado?: number | null;
  requisicoes_mes?: number;
}

/** IA-33 — consumo da organização para owner/admin (sem fornecedor nem chave). */
export const IaConsumoCard = () => {
  const { orgId, isAdmin } = useOrganization();
  const query = useQuery({
    queryKey: ["org", "ia-consumo", orgId],
    enabled: !!orgId && isAdmin,
    staleTime: 60_000,
    queryFn: async (): Promise<ConsumoIa> => {
      const { data, error } = await supabase.rpc("ia_consumo_organizacao", { _org_id: orgId! });
      if (error) throw error;
      return (data ?? {}) as ConsumoIa;
    },
  });

  if (!isAdmin) return null;

  if (query.isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Carregando consumo de IA" />
        </CardContent>
      </Card>
    );
  }

  if (query.isError || !query.data) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Não foi possível carregar o consumo de IA</AlertTitle>
        <AlertDescription>Tente recarregar a página.</AlertDescription>
      </Alert>
    );
  }

  const c = query.data;
  const orcamento =
    c.orcamento_cents != null
      ? (c.orcamento_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : "Sem teto definido";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="h-5 w-5" /> Uso de IA
        </CardTitle>
        <CardDescription>
          Consumo estimado do mês da organização. Detalhes de fornecedor e chaves ficam só com a equipe Brandplay.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 sm:grid-cols-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Status</dt>
            <dd className="font-medium">{c.ia_habilitada === false ? "Desativada" : "Ativa"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Requisições no mês</dt>
            <dd className="font-medium">{c.requisicoes_mes ?? 0}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Gasto estimado</dt>
            <dd className="font-medium">
              {(c.gasto_mes_brl ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Orçamento mensal</dt>
            <dd className="font-medium">{orcamento}</dd>
          </div>
          {c.pct_usado != null && (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Uso do orçamento</dt>
              <dd className={`font-medium ${c.pct_usado >= 80 ? "text-warning-strong" : ""}`}>
                {Math.round(c.pct_usado)}% (alerta em {c.alerta_pct ?? 80}%)
              </dd>
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  );
};
