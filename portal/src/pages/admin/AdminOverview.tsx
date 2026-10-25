import { Link } from "react-router-dom";
import { AlertTriangle, Banknote, Building2, Clock, Hourglass, Loader2, Sparkles, TrendingUp, Wallet } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AccessSourceBadge } from "@/components/admin/AccessSourceBadge";
import { StatTile } from "@/components/admin/StatTile";
import { useAdminIaConsumo } from "@/hooks/useAdminAi";
import { useAdminClients, useAdminProjection, useAdminRevenue } from "@/hooks/usePlatformAdmin";
import { formatBrl } from "@/lib/adminAi";
import { formatCents, formatDate, SUBSCRIPTION_STATUS_LABEL } from "@/lib/billing";
import { summarizeClients, type AdminClient } from "@/lib/platformAdmin";
import { PageHeader } from "@/components/common/PageHeader";

const ListaDeClientes = ({ clientes, vazio, detalhe }: {
  clientes: AdminClient[];
  vazio: string;
  detalhe: (c: AdminClient) => string;
}) =>
  clientes.length === 0 ? (
    <p className="py-4 text-sm text-muted-foreground">{vazio}</p>
  ) : (
    <ul className="divide-y">
      {clientes.map((c) => (
        <li key={c.organization_id}>
          <Link
            to={`/admin/clientes/${c.organization_id}`}
            className="flex items-center justify-between gap-3 rounded-md px-2 py-2.5 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{c.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{detalhe(c)}</span>
            </span>
            <AccessSourceBadge source={c.access_source} />
          </Link>
        </li>
      ))}
    </ul>
  );

const AdminOverview = () => {
  const clientes = useAdminClients();
  const projecao = useAdminProjection(6);
  const realizado = useAdminRevenue(2);
  const iaConsumo = useAdminIaConsumo(1);

  if (clientes.isLoading || projecao.isLoading || realizado.isLoading || iaConsumo.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Carregando visão geral" />
      </div>
    );
  }

  if (
    clientes.isError ||
    projecao.isError ||
    realizado.isError ||
    iaConsumo.isError ||
    !clientes.data ||
    !projecao.data ||
    !iaConsumo.data
  ) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Não foi possível carregar a visão geral</AlertTitle>
        <AlertDescription>Tente recarregar a página em instantes.</AlertDescription>
      </Alert>
    );
  }

  const resumo = summarizeClients(clientes.data);
  const p = projecao.data;
  const mesAtual = realizado.data?.[realizado.data.length - 1];
  const inadimplentes = clientes.data.filter((c) => c.subscription_status === "inadimplente");
  const gastoIaMes = iaConsumo.data.meses.at(-1)?.gasto_brl ?? 0;
  const receitaMes = mesAtual?.revenue_cents ?? 0;
  const margemIaPct =
    receitaMes > 0 ? Math.round((1 - (gastoIaMes * 100) / receitaMes) * 1000) / 10 : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Visão geral" description="Clientes, receita e o que pede atenção na plataforma." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile
          label="MRR"
          value={formatCents(p.mrr_cents)}
          hint={`${p.customers} ${p.customers === 1 ? "assinatura ativa" : "assinaturas ativas"} · ticket médio ${formatCents(p.average_ticket_cents)}`}
          icon={TrendingUp}
        />
        <StatTile
          label="Recebido no mês"
          value={formatCents(mesAtual?.revenue_cents ?? 0)}
          hint={`${mesAtual?.paid_invoices ?? 0} faturas pagas`}
          icon={Banknote}
        />
        <StatTile
          label="Custo de IA no mês"
          value={formatBrl(gastoIaMes)}
          hint={
            margemIaPct != null
              ? `Estimado · ~${margemIaPct}% da receita do mês após IA`
              : "Gasto estimado (tokens × preços cadastrados)"
          }
          icon={Sparkles}
        />
        <StatTile
          label="Organizações"
          value={String(resumo.total)}
          hint={`${resumo.bySource.subscription} assinantes · ${resumo.bySource.trial} em teste`}
          icon={Building2}
        />
        <StatTile
          label="Em teste grátis"
          value={String(p.in_trial)}
          hint={`${resumo.trialsEndingSoon.length} terminam em até 3 dias`}
          icon={Hourglass}
        />
        <StatTile
          label="Aguardando pagamento"
          value={String(p.awaiting_payment)}
          hint="Contratações com boleto em aberto"
          icon={Clock}
        />
        <StatTile
          label="Sem acesso"
          value={String(resumo.bySource.none)}
          hint={`${resumo.delinquent} ${resumo.delinquent === 1 ? "assinatura" : "assinaturas"} com pagamento em atraso`}
          icon={Wallet}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">Maior consumo de IA no mês</CardTitle>
              <CardDescription>Top 10 organizações por gasto estimado (referência de margem).</CardDescription>
            </div>
            <Link
              to="/admin/ia"
              className="text-sm font-medium text-primary hover:underline shrink-0"
            >
              Ver IA
            </Link>
          </CardHeader>
          <CardContent>
            {iaConsumo.data.top_mes.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">Nenhum uso de IA registrado neste mês.</p>
            ) : (
              <ul className="divide-y">
                {iaConsumo.data.top_mes.map((row) => (
                  <li key={row.organization_id}>
                    <Link
                      to={`/admin/ia/clientes/${row.organization_id}`}
                      className="flex items-center justify-between gap-3 rounded-md px-2 py-2.5 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="min-w-0 truncate text-sm font-medium">{row.nome}</span>
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                        {formatBrl(Number(row.gasto_brl))} · {row.requisicoes}{" "}
                        {row.requisicoes === 1 ? "req." : "reqs."}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Testes terminando</CardTitle>
            <CardDescription>Acabam em até 3 dias, sem assinatura.</CardDescription>
          </CardHeader>
          <CardContent>
            <ListaDeClientes
              clientes={resumo.trialsEndingSoon}
              vazio="Nenhum teste termina nos próximos 3 dias."
              detalhe={(c) => `Termina em ${formatDate(c.trial_ends_at)}`}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Boleto aguardando</CardTitle>
            <CardDescription>Sem acesso, com contratação aguardando compensação.</CardDescription>
          </CardHeader>
          <CardContent>
            <ListaDeClientes
              clientes={resumo.awaitingPayment}
              vazio="Nenhuma organização bloqueada aguardando boleto."
              detalhe={(c) => `${c.plan_name ?? c.plan_id ?? "Plano"} · ${c.owner_email ?? "sem e-mail"}`}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pagamento em atraso</CardTitle>
            <CardDescription>O Stripe ainda está cobrando; o acesso continua.</CardDescription>
          </CardHeader>
          <CardContent>
            <ListaDeClientes
              clientes={inadimplentes}
              vazio="Nenhuma assinatura em atraso."
              detalhe={(c) =>
                `${SUBSCRIPTION_STATUS_LABEL.inadimplente} · ${c.open_invoices} ${c.open_invoices === 1 ? "fatura aberta" : "faturas abertas"}`
              }
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminOverview;
