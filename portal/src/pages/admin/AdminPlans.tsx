import { AlertTriangle, Loader2, Pencil, Plus, RefreshCw, Star } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlanFormDialog } from "@/components/admin/PlanFormDialog";
import { useBillingSettings } from "@/hooks/useBilling";
import { useAdminPlans, useSavePlan } from "@/hooks/usePlatformAdmin";
import { formatCents } from "@/lib/billing";
import { stripeSyncNotice } from "@/lib/platformAdmin";
import { PageHeader } from "@/components/common/PageHeader";

const limite = (n: number | null) => (n == null ? "Sem limite" : String(n));

const AdminPlans = () => {
  const planos = useAdminPlans();
  const parametros = useBillingSettings();
  const salvar = useSavePlan();
  const sincronizandoId =
    salvar.isPending && salvar.variables?.action === "sync" ? salvar.variables.planId : null;

  const sincronizar = (planId: string) =>
    salvar.mutate(
      { action: "sync", planId },
      {
        onSuccess: (r) => {
          const aviso = stripeSyncNotice(r.stripe);
          if (aviso) toast[aviso.tone](aviso.text);
          else toast.success(r.stripe.status === "sem_preco" ? "Plano sob consulta: nada a sincronizar." : "Stripe sincronizado.");
        },
        onError: (e) => toast.error(e.message),
      },
    );

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Planos"
        description="O catálogo do banco é a regra comercial: preço e limites valem na hora, e o Stripe recebe produto e preço ao salvar. Plano não é apagado — tire de venda; quem assina continua nele."
        actions={
          <>
            <PlanFormDialog
              plan={null}
              trigger={
                <Button>
                  <Plus /> Novo plano
                </Button>
              }
            />
          </>
        }
      />

      {planos.isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Carregando planos" />
        </div>
      ) : planos.isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar os planos</AlertTitle>
          <AlertDescription>Tente recarregar a página em instantes.</AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plano</TableHead>
                  <TableHead className="text-right">Preço/mês</TableHead>
                  <TableHead className="hidden md:table-cell">Propriedades</TableHead>
                  <TableHead className="hidden md:table-cell">Usuários</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="hidden lg:table-cell">Stripe</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(planos.data ?? []).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex items-center gap-1.5 font-medium">
                        {p.name}
                        {p.highlight && <Star className="h-3.5 w-3.5 fill-current text-warning-strong" aria-label="Em destaque" />}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        <code>{p.id}</code>
                        {parametros.data?.trial_plan_id === p.id && " · plano do teste grátis"}
                      </p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCents(p.price_cents)}</TableCell>
                    <TableCell className="hidden md:table-cell">{limite(p.max_properties)}</TableCell>
                    <TableCell className="hidden md:table-cell">{limite(p.max_users)}</TableCell>
                    <TableCell>
                      <Badge variant={p.active ? "secondary" : "outline"}>{p.active ? "À venda" : "Fora de venda"}</Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                      {p.price_cents == null
                        ? "Sob consulta"
                        : p.stripe_price_id
                          ? <code>{p.stripe_price_id}</code>
                          : "Ainda não criado"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => sincronizar(p.id)}
                          disabled={sincronizandoId !== null}
                          aria-label={`Sincronizar ${p.name} com o Stripe`}
                        >
                          <RefreshCw className={sincronizandoId === p.id ? "animate-spin" : undefined} />
                          <span className="hidden xl:inline">Sincronizar</span>
                        </Button>
                        <PlanFormDialog
                          plan={p}
                          trigger={
                            <Button variant="ghost" size="sm" aria-label={`Editar ${p.name}`}>
                              <Pencil /> <span className="hidden xl:inline">Editar</span>
                            </Button>
                          }
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AdminPlans;
