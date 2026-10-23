import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Building2, ChevronRight, Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AccessSourceBadge } from "@/components/admin/AccessSourceBadge";
import { useAdminClients, useAdminPlans } from "@/hooks/usePlatformAdmin";
import { formatCents, formatDate, SUBSCRIPTION_STATUS_LABEL } from "@/lib/billing";
import { ACCESS_SOURCE_LABEL, filterClients, type AccessSource, type ClientFilters } from "@/lib/platformAdmin";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";

const SITUACOES: AccessSource[] = ["subscription", "trial", "provisional", "none"];

const AdminClients = () => {
  const clientes = useAdminClients();
  const planos = useAdminPlans();
  const [filtros, setFiltros] = useState<ClientFilters>({ search: "", source: "todas", planId: "todos" });

  const visiveis = useMemo(() => filterClients(clientes.data ?? [], filtros), [clientes.data, filtros]);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Clientes"
        description="Organizações da plataforma, com a situação da cobrança e o uso. Dados de domínio (patrocinadores, contratos, propostas) não aparecem aqui."
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="busca-clientes">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="busca-clientes"
              placeholder="Organização, responsável ou e-mail"
              className="pl-9"
              value={filtros.search}
              onChange={(e) => setFiltros((f) => ({ ...f, search: e.target.value }))}
            />
          </div>
        </div>
        <div className="space-y-1.5 md:w-56">
          <Label htmlFor="filtro-situacao">Situação</Label>
          <Select
            value={filtros.source}
            onValueChange={(v) => setFiltros((f) => ({ ...f, source: v as ClientFilters["source"] }))}
          >
            <SelectTrigger id="filtro-situacao">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {SITUACOES.map((s) => (
                <SelectItem key={s} value={s}>
                  {ACCESS_SOURCE_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 md:w-56">
          <Label htmlFor="filtro-plano">Plano vigente</Label>
          <Select value={filtros.planId} onValueChange={(v) => setFiltros((f) => ({ ...f, planId: v }))}>
            <SelectTrigger id="filtro-plano">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {(planos.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {clientes.isLoading ? (
        <LoadingSkeleton />
      ) : clientes.isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar os clientes</AlertTitle>
          <AlertDescription>Tente recarregar a página em instantes.</AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardContent className="p-0">
            {visiveis.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
                <Building2 className="h-8 w-8" aria-hidden="true" />
                {clientes.data?.length ? "Nenhuma organização com esses filtros." : "Nenhuma organização cadastrada."}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organização</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead className="hidden lg:table-cell">Assinatura</TableHead>
                    <TableHead className="hidden md:table-cell">Uso</TableHead>
                    <TableHead className="text-right">MRR</TableHead>
                    <TableHead className="hidden lg:table-cell">Desde</TableHead>
                    <TableHead className="w-8">
                      <span className="sr-only">Abrir</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiveis.map((c) => (
                    <TableRow key={c.organization_id}>
                      <TableCell>
                        <Link
                          to={`/admin/clientes/${c.organization_id}`}
                          className="font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                        >
                          {c.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{c.owner_email ?? "—"}</p>
                      </TableCell>
                      <TableCell>
                        <AccessSourceBadge source={c.access_source} />
                        {c.access_source === "trial" && c.trial_ends_at && (
                          <p className="mt-1 text-xs text-muted-foreground">até {formatDate(c.trial_ends_at)}</p>
                        )}
                      </TableCell>
                      <TableCell>{c.plan_name ?? "—"}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {c.subscription_status ? SUBSCRIPTION_STATUS_LABEL[c.subscription_status] : "—"}
                        {c.cancel_at_period_end && (
                          <p className="text-xs text-muted-foreground">cancela em {formatDate(c.current_period_end)}</p>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm tabular-nums">
                        {c.properties} prop. · {c.users_active + c.invites_pending} usu.
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.mrr_cents > 0 ? formatCents(c.mrr_cents) : "—"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">{formatDate(c.created_at)}</TableCell>
                      <TableCell>
                        <Link
                          to={`/admin/clientes/${c.organization_id}`}
                          aria-label={`Abrir ${c.name}`}
                          className="inline-flex rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
      {!clientes.isLoading && !clientes.isError && (
        <p className="text-xs text-muted-foreground">
          {visiveis.length} de {clientes.data?.length ?? 0} organizações.
        </p>
      )}
    </div>
  );
};

export default AdminClients;
