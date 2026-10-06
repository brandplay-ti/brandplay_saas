import { Check, Minus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type Role = "owner" | "admin" | "comercial" | "operacional" | "financeiro";

const ROLES: { key: Role; label: string; tone: string }[] = [
  { key: "owner", label: "Proprietário", tone: "bg-primary/10 text-primary" },
  { key: "admin", label: "Administrador", tone: "bg-primary/10 text-primary" },
  { key: "comercial", label: "Comercial", tone: "bg-secondary text-secondary-foreground" },
  { key: "operacional", label: "Operacional", tone: "bg-secondary text-secondary-foreground" },
  { key: "financeiro", label: "Financeiro", tone: "bg-secondary text-secondary-foreground" },
];

type Perm = "read" | "write" | "none";

const MATRIX: { module: string; description: string; perms: Record<Role, Perm> }[] = [
  {
    module: "Dashboard",
    description: "Visão geral, KPIs, widgets",
    perms: { owner: "write", admin: "write", comercial: "read", operacional: "read", financeiro: "read" },
  },
  {
    module: "Patrocinadores e CRM",
    description: "Patrocinadores, lead scoring, pipeline, propostas",
    perms: { owner: "write", admin: "write", comercial: "write", operacional: "none", financeiro: "read" },
  },
  {
    module: "Propriedades e Ativos",
    description: "Cadastro de propriedades esportivas, cotas e ativos",
    perms: { owner: "write", admin: "write", comercial: "write", operacional: "write", financeiro: "read" },
  },
  {
    module: "Contratos",
    description: "Contratos, cláusulas, renovações",
    perms: { owner: "write", admin: "write", comercial: "write", operacional: "read", financeiro: "write" },
  },
  {
    module: "Financeiro",
    description: "Parcelas, recebimentos, fluxo de caixa",
    perms: { owner: "write", admin: "write", comercial: "read", operacional: "none", financeiro: "write" },
  },
  {
    module: "Entregas e Campo",
    description: "Entregas, evidências, app de campo, checklists",
    perms: { owner: "write", admin: "write", comercial: "read", operacional: "write", financeiro: "none" },
  },
  {
    module: "Relatórios",
    description: "Sell-out, executivos, exportações",
    perms: { owner: "write", admin: "write", comercial: "read", operacional: "read", financeiro: "read" },
  },
  {
    module: "Acessos ao Portal",
    description: "Liberar e revogar acessos de patrocinadores",
    perms: { owner: "write", admin: "write", comercial: "none", operacional: "none", financeiro: "none" },
  },
  {
    module: "Equipe e Configurações",
    description: "Convidar membros, alterar papéis, auditoria",
    perms: { owner: "write", admin: "write", comercial: "none", operacional: "none", financeiro: "none" },
  },
];

const PermCell = ({ perm }: { perm: Perm }) => {
  if (perm === "write")
    return (
      <div className="flex items-center justify-center">
        <Badge className="bg-primary/15 text-primary hover:bg-primary/20">
          <Check className="h-3 w-3 mr-1" /> Edita
        </Badge>
      </div>
    );
  if (perm === "read")
    return (
      <div className="flex items-center justify-center">
        <Badge variant="outline">
          <Check className="h-3 w-3 mr-1" /> Lê
        </Badge>
      </div>
    );
  return (
    <div className="flex items-center justify-center text-muted-foreground">
      <Minus className="h-4 w-4" />
    </div>
  );
};

export const PermissionsMatrix = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Matriz de permissões</CardTitle>
        <CardDescription>O que cada papel pode fazer em cada módulo do sistema.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[220px]">Módulo</TableHead>
                {ROLES.map((r) => (
                  <TableHead key={r.key} className="text-center min-w-[110px]">
                    {r.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {MATRIX.map((row) => (
                <TableRow key={row.module}>
                  <TableCell>
                    <div className="font-medium">{row.module}</div>
                    <div className="text-xs text-muted-foreground">{row.description}</div>
                  </TableCell>
                  {ROLES.map((r) => (
                    <TableCell key={r.key}>
                      <PermCell perm={row.perms[r.key]} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          <strong>Edita</strong> = pode criar, alterar e excluir registros do módulo. <strong>Lê</strong> = apenas
          visualiza. <strong>—</strong> = sem acesso.
        </p>
      </CardContent>
    </Card>
  );
};
