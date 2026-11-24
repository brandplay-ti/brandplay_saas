import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddSupportDialog } from "@/components/admin/AddSupportDialog";
import { CommentedActionDialog } from "@/components/admin/CommentedActionDialog";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { useAdminTeam, useReactivateSupport, useRevokeSupport } from "@/hooks/usePlatformAdmin";
import { formatDate, formatDateTime } from "@/lib/billing";
import { PLATFORM_ROLE_LABEL } from "@/lib/platformAdmin";

function avisarErro(erro: unknown) {
  toast.error(erro instanceof Error ? erro.message : "Não foi possível concluir a ação.");
}

/**
 * Equipe da plataforma (0046): superadmin e suporte. O superadmin cadastra,
 * revoga e reativa o Suporte. Superadmin é concedido e revogado só por quem
 * opera o banco (`docs/runbooks/superadmin.md`).
 */
const AdminTeam = () => {
  const equipe = useAdminTeam();
  const revogar = useRevokeSupport();
  const reativar = useReactivateSupport();

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Equipe"
        description="Quem opera o BrandPlay. O suporte atende os clientes (clientes, faturas, descontos e painel do cliente); faturamento, planos, IA e a equipe são do superadmin. Superadmin novo é concedido por quem opera o banco."
        actions={<AddSupportDialog />}
      />

      {equipe.isLoading ? (
        <LoadingSkeleton variant="lista" count={3} />
      ) : equipe.isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar a equipe</AlertTitle>
          <AlertDescription>Tente recarregar a página em instantes.</AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pessoa</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead className="hidden md:table-cell">Desde</TableHead>
                  <TableHead className="hidden lg:table-cell">Último acesso</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(equipe.data ?? []).map((m) => (
                  <TableRow
                    key={m.user_id}
                    className={m.revoked_at ? "text-muted-foreground" : undefined}
                  >
                    <TableCell>
                      <p className="font-medium">{m.full_name ?? "Sem nome"}</p>
                      <p className="text-xs text-muted-foreground break-all">{m.email}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.role === "superadmin" ? "default" : "secondary"}>
                        {PLATFORM_ROLE_LABEL[m.role]}
                      </Badge>
                      {m.revoked_at && (
                        <p className="mt-1 text-xs">revogado em {formatDate(m.revoked_at)}</p>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {formatDate(m.created_at)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {m.last_sign_in_at ? formatDateTime(m.last_sign_in_at) : "Nunca entrou"}
                    </TableCell>
                    <TableCell className="text-right">
                      {m.role !== "suporte" ? null : m.revoked_at ? (
                        <CommentedActionDialog
                          trigger={
                            <Button variant="outline" size="sm">
                              Reativar
                            </Button>
                          }
                          title={`Reativar ${m.full_name ?? m.email}`}
                          description="Volta com o perfil Suporte. A senha da conta não muda."
                          confirmLabel="Reativar"
                          onConfirm={async ({ comment }) => {
                            try {
                              await reativar.mutateAsync({ email: m.email, comment });
                              toast.success("Suporte reativado.");
                            } catch (e) {
                              avisarErro(e);
                              throw e;
                            }
                          }}
                        />
                      ) : (
                        <CommentedActionDialog
                          trigger={
                            <Button variant="ghost" size="sm">
                              Revogar
                            </Button>
                          }
                          title={`Revogar ${m.full_name ?? m.email}`}
                          description="O acesso à administração cai na próxima consulta, e a sessão de suporte aberta é encerrada. A conta continua existindo."
                          confirmLabel="Revogar"
                          destructive
                          onConfirm={async ({ comment }) => {
                            try {
                              await revogar.mutateAsync({ userId: m.user_id, comment });
                              toast.success("Suporte revogado.");
                            } catch (e) {
                              avisarErro(e);
                              throw e;
                            }
                          }}
                        />
                      )}
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

export default AdminTeam;
