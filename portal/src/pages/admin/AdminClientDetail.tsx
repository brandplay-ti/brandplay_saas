import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CalendarPlus, ExternalLink, History, Loader2, Unlock } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AccessSourceBadge } from "@/components/admin/AccessSourceBadge";
import { CommentedActionDialog } from "@/components/admin/CommentedActionDialog";
import { useBillingSettings } from "@/hooks/useBilling";
import {
  useAdminClientDetail,
  useExtendTrial,
  useGrantAccess,
  useRevokeGrant,
} from "@/hooks/usePlatformAdmin";
import {
  formatCents,
  formatDate,
  formatDateTime,
  INVOICE_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  SUBSCRIPTION_STATUS_LABEL,
  usageLabel,
} from "@/lib/billing";
import { auditActionLabel, GRANT_KIND_LABEL } from "@/lib/platformAdmin";

const Campo = ({ rotulo, valor }: { rotulo: string; valor: ReactNode }) => (
  <div>
    <dt className="text-xs text-muted-foreground">{rotulo}</dt>
    <dd className="text-sm font-medium break-words">{valor || "—"}</dd>
  </div>
);

const Vazio = ({ texto }: { texto: string }) => <p className="py-6 text-center text-sm text-muted-foreground">{texto}</p>;

function avisarErro(erro: unknown) {
  toast.error(erro instanceof Error ? erro.message : "Não foi possível concluir a ação.");
}

const AdminClientDetail = () => {
  const { id = "" } = useParams<{ id: string }>();
  const detalhe = useAdminClientDetail(id);
  const parametros = useBillingSettings();
  const liberar = useGrantAccess(id);
  const estender = useExtendTrial(id);
  const revogar = useRevokeGrant(id);

  if (detalhe.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Carregando cliente" />
      </div>
    );
  }

  if (detalhe.isError || !detalhe.data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/clientes">
            <ArrowLeft /> Clientes
          </Link>
        </Button>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{detalhe.isError ? "Não foi possível carregar o cliente" : "Organização não encontrada"}</AlertTitle>
          <AlertDescription>
            {detalhe.isError ? "Tente recarregar a página em instantes." : "Ela pode ter sido removida."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const { organization: org, billing, usage, subscriptions, invoices, grants, audit } = detalhe.data;
  const plano = billing.plan;
  const horasPadrao = parametros.data?.provisional_access_hours ?? 72;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/admin/clientes">
            <ArrowLeft /> Clientes
          </Link>
        </Button>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight break-words">{org.name}</h1>
              <AccessSourceBadge source={billing.access_source} />
            </div>
            <p className="mt-1 text-muted-foreground">Cliente desde {formatDate(org.created_at)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <CommentedActionDialog
              trigger={
                <Button variant="outline">
                  <CalendarPlus /> Estender teste
                </Button>
              }
              title="Estender o teste grátis"
              description={
                billing.trial_ends_at
                  ? `O teste termina em ${formatDateTime(billing.trial_ends_at)}. Os dias são somados a partir do fim atual, ou de agora se já terminou.`
                  : "Os dias são somados a partir de agora."
              }
              confirmLabel="Estender"
              numberField={{ label: "Dias", min: 1, max: 90, defaultValue: 7 }}
              onConfirm={async ({ amount, comment }) => {
                try {
                  const r = await estender.mutateAsync({ days: amount ?? 0, comment });
                  toast.success(`Teste estendido até ${formatDateTime(r.trial_ends_at)}.`);
                } catch (e) {
                  avisarErro(e);
                  throw e;
                }
              }}
            />
            <CommentedActionDialog
              trigger={
                <Button>
                  <Unlock /> Liberar acesso
                </Button>
              }
              title="Liberar acesso provisoriamente"
              description="Não altera a assinatura: o acesso cai sozinho no fim do prazo. Valem os limites do plano que aguarda pagamento, ou os do teste."
              confirmLabel="Liberar"
              numberField={{
                label: "Horas",
                min: 1,
                max: 720,
                defaultValue: horasPadrao,
                description: `Padrão da plataforma: ${horasPadrao} h. Máximo: 720 h (30 dias).`,
              }}
              onConfirm={async ({ amount, comment }) => {
                try {
                  const r = await liberar.mutateAsync({ hours: amount ?? 0, comment });
                  toast.success(`Acesso liberado até ${formatDateTime(r.expires_at)}.`);
                } catch (e) {
                  avisarErro(e);
                  throw e;
                }
              }}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cadastro</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3">
              <Campo rotulo="Razão social" valor={org.legal_name} />
              <Campo rotulo="CNPJ" valor={org.cnpj} />
              <Campo rotulo="E-mail da organização" valor={org.email} />
              <Campo rotulo="Telefone" valor={org.phone} />
              <Campo rotulo="Cidade" valor={org.city ? `${org.city}${org.state ? ` / ${org.state}` : ""}` : null} />
              <Campo
                rotulo="Proprietário"
                valor={org.owner ? `${org.owner.name ?? "Sem nome"} · ${org.owner.email ?? "sem e-mail"}` : null}
              />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cobrança</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3">
              <Campo rotulo="Plano vigente" valor={plano ? `${plano.name} · ${formatCents(plano.price_cents)}` : "Nenhum (sem acesso)"} />
              <Campo rotulo="Fim do teste grátis" valor={formatDateTime(billing.trial_ends_at)} />
              <Campo
                rotulo="Customer no Stripe"
                valor={billing.stripe_customer_id ? <code className="text-xs">{billing.stripe_customer_id}</code> : "Ainda não contratou"}
              />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Uso</CardTitle>
            <CardDescription>Contagens. O conteúdo é da organização.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3">
              <Campo rotulo="Propriedades" valor={usageLabel(usage.properties, plano?.max_properties ?? null, "propriedades")} />
              <Campo
                rotulo="Usuários (ativos + convites)"
                valor={usageLabel(usage.users_active + usage.invites_pending, plano?.max_users ?? null, "usuários")}
              />
              <Campo rotulo="Convites pendentes" valor={String(usage.invites_pending)} />
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Liberações de acesso</CardTitle>
          <CardDescription>Provisórias, enquanto o boleto compensa ou por decisão da equipe.</CardDescription>
        </CardHeader>
        <CardContent>
          {grants.length === 0 ? (
            <Vazio texto="Nenhuma liberação." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Origem</TableHead>
                  <TableHead>Quando</TableHead>
                  <TableHead>Até</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="text-right">Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grants.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell>
                      {GRANT_KIND_LABEL[g.kind]}
                      {g.granted_by_email && <p className="text-xs text-muted-foreground">{g.granted_by_email}</p>}
                    </TableCell>
                    <TableCell>{formatDateTime(g.created_at)}</TableCell>
                    <TableCell>{formatDateTime(g.revoked_at ?? g.expires_at)}</TableCell>
                    <TableCell className="max-w-xs text-sm">
                      {g.comment ?? (g.kind === "confianca" ? "Comprovante de boleto enviado pelo cliente" : "—")}
                    </TableCell>
                    <TableCell className="text-right">
                      {g.active ? (
                        <CommentedActionDialog
                          trigger={
                            <Button variant="outline" size="sm">
                              Revogar
                            </Button>
                          }
                          title="Revogar liberação"
                          description="O acesso provisório termina agora. A liberação fica no histórico."
                          confirmLabel="Revogar"
                          destructive
                          onConfirm={async ({ comment }) => {
                            try {
                              await revogar.mutateAsync({ grantId: g.id, comment });
                              toast.success("Liberação revogada.");
                            } catch (e) {
                              avisarErro(e);
                              throw e;
                            }
                          }}
                        />
                      ) : (
                        <Badge variant="outline">{g.revoked_at ? "Revogada" : "Encerrada"}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assinaturas</CardTitle>
            <CardDescription>Projeção do Stripe, da mais recente para a mais antiga.</CardDescription>
          </CardHeader>
          <CardContent>
            {subscriptions.length === 0 ? (
              <Vazio texto="Nenhuma contratação." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plano</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Forma</TableHead>
                    <TableHead>Período até</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscriptions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        {s.plan_name ?? s.plan_id}
                        <p className="text-xs text-muted-foreground">desde {formatDate(s.created_at)}</p>
                      </TableCell>
                      <TableCell>
                        {SUBSCRIPTION_STATUS_LABEL[s.status] ?? s.status}
                        {s.cancel_at_period_end && <p className="text-xs text-muted-foreground">cancelamento agendado</p>}
                      </TableCell>
                      <TableCell>{s.payment_method ? PAYMENT_METHOD_LABEL[s.payment_method] : "—"}</TableCell>
                      <TableCell>{formatDate(s.canceled_at ?? s.current_period_end)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Faturas</CardTitle>
            <CardDescription>Só leitura: o Stripe é a fonte do financeiro.</CardDescription>
          </CardHeader>
          <CardContent>
            {invoices.length === 0 ? (
              <Vazio texto="Nenhuma fatura." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fatura</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">Abrir no Stripe</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell>
                        {f.number ?? "—"}
                        <p className="text-xs text-muted-foreground">vence {formatDate(f.due_at)}</p>
                      </TableCell>
                      <TableCell className="tabular-nums">{formatCents(f.amount_cents)}</TableCell>
                      <TableCell>{INVOICE_STATUS_LABEL[f.status] ?? f.status}</TableCell>
                      <TableCell>
                        {f.paid_at ? formatDate(f.paid_at) : "—"}
                        {f.payment_method && (
                          <p className="text-xs text-muted-foreground">{PAYMENT_METHOD_LABEL[f.payment_method]}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {f.hosted_invoice_url && (
                          <Button asChild variant="ghost" size="sm">
                            <a href={f.hosted_invoice_url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir fatura ${f.number ?? ""} no Stripe`}>
                              <ExternalLink />
                            </a>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" aria-hidden="true" /> Histórico administrativo
          </CardTitle>
          <CardDescription>Ações do superadmin sobre esta organização (últimas 50).</CardDescription>
        </CardHeader>
        <CardContent>
          {audit.length === 0 ? (
            <Vazio texto="Nenhuma ação registrada." />
          ) : (
            <ul className="divide-y">
              {audit.map((a) => (
                <li key={a.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{auditActionLabel(a.action)}</p>
                    {a.comment && <p className="text-sm text-muted-foreground break-words">{a.comment}</p>}
                  </div>
                  <p className="shrink-0 text-xs text-muted-foreground sm:text-right">
                    {formatDateTime(a.created_at)}
                    <br />
                    {a.admin_email ?? "operação manual"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminClientDetail;
