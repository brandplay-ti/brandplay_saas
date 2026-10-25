import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import {
  ACESSO_DE_MODULO,
  MODULOS_DE_PERMISSAO,
  PAPEIS_DE_PERMISSAO,
  type AcessoDeModulo,
  type ModuloDePermissao,
  type PapelDePermissao,
} from "@/lib/permissoes";

type Linha = { role: PapelDePermissao; module: ModuloDePermissao; access: AcessoDeModulo };

/** Matriz que o admin da conta edita. O banco é a fronteira; isto só grava a linha. */
export const PermissionsMatrix = () => {
  const { orgId, role, isAdmin, refresh } = useOrganization();
  const queryClient = useQueryClient();
  const [salvando, setSalvando] = useState<string | null>(null);

  const matriz = useQuery({
    queryKey: ["role-grants", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_role_grants")
        .select("role, module, access")
        .eq("organization_id", orgId!);
      if (error) throw error;
      return data as Linha[];
    },
  });

  const acesso = (papel: PapelDePermissao, modulo: ModuloDePermissao): AcessoDeModulo =>
    matriz.data?.find((l) => l.role === papel && l.module === modulo)?.access ?? "none";

  const podeEditar = (papel: PapelDePermissao, modulo: ModuloDePermissao) => {
    if (!isAdmin || papel === "owner") return false;
    if (papel === "admin" && modulo === "team" && role !== "owner") return false;
    return true;
  };

  const salvar = async (papel: PapelDePermissao, modulo: ModuloDePermissao, access: AcessoDeModulo) => {
    if (!orgId || access === acesso(papel, modulo)) return;
    const chave = `${papel}:${modulo}`;
    setSalvando(chave);
    const { error } = await supabase
      .from("organization_role_grants")
      .update({ access })
      .eq("organization_id", orgId)
      .eq("role", papel)
      .eq("module", modulo);
    setSalvando(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["role-grants", orgId] });
    await refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Matriz de permissões</CardTitle>
        <CardDescription>
          O que cada papel faz em CRM, entregas, financeiro e equipe. O proprietário permanece com edição. A equipe
          dos administradores só o proprietário altera.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[220px]">Módulo</TableHead>
                {PAPEIS_DE_PERMISSAO.map((p) => (
                  <TableHead key={p.key} className="text-center min-w-[140px]">
                    {p.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {MODULOS_DE_PERMISSAO.map((modulo) => (
                <TableRow key={modulo.key}>
                  <TableCell>
                    <div className="font-medium">{modulo.label}</div>
                    <div className="text-xs text-muted-foreground">{modulo.description}</div>
                  </TableCell>
                  {PAPEIS_DE_PERMISSAO.map((papel) => {
                    const valor = acesso(papel.key, modulo.key);
                    const editavel = podeEditar(papel.key, modulo.key);
                    return (
                      <TableCell key={papel.key}>
                        <Select
                          value={valor}
                          disabled={!editavel || salvando === `${papel.key}:${modulo.key}` || matriz.isLoading}
                          onValueChange={(v) => salvar(papel.key, modulo.key, v as AcessoDeModulo)}
                        >
                          <SelectTrigger className="h-8" aria-label={`${modulo.label} para ${papel.label}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(ACESSO_DE_MODULO) as AcessoDeModulo[]).map((opcao) => (
                              <SelectItem key={opcao} value={opcao}>
                                {ACESSO_DE_MODULO[opcao]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {!isAdmin && (
          <p className="mt-4 text-xs text-muted-foreground">Só o proprietário ou um administrador altera esta matriz.</p>
        )}
      </CardContent>
    </Card>
  );
};
