import { forwardRef, useImperativeHandle, useState } from "react";
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
import type { ControleDeEdicao } from "@/components/team/TeamManagement";

type Linha = { role: PapelDePermissao; module: ModuloDePermissao; access: AcessoDeModulo };

const chaveDe = (papel: PapelDePermissao, modulo: ModuloDePermissao) => `${papel}:${modulo}`;

/** Matriz que o admin da conta edita. O banco é a fronteira; isto só grava a linha. */
export const PermissionsMatrix = forwardRef<ControleDeEdicao, { editando: boolean }>(function PermissionsMatrix(
  { editando },
  ref,
) {
  const { orgId, role, isAdmin, refresh } = useOrganization();
  const queryClient = useQueryClient();
  const [rascunho, setRascunho] = useState<Partial<Record<string, AcessoDeModulo>>>({});
  const [salvando, setSalvando] = useState(false);

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

  const acessoGravado = (papel: PapelDePermissao, modulo: ModuloDePermissao): AcessoDeModulo =>
    matriz.data?.find((l) => l.role === papel && l.module === modulo)?.access ?? "none";

  const acesso = (papel: PapelDePermissao, modulo: ModuloDePermissao): AcessoDeModulo => {
    if (!editando) return acessoGravado(papel, modulo);
    return rascunho[chaveDe(papel, modulo)] ?? acessoGravado(papel, modulo);
  };

  const podeEditar = (papel: PapelDePermissao, modulo: ModuloDePermissao) => {
    if (!isAdmin || papel === "owner") return false;
    if (papel === "admin" && modulo === "team" && role !== "owner") return false;
    return true;
  };

  useImperativeHandle(ref, () => ({
    descartar: () => setRascunho({}),
    salvar: async () => {
      if (!orgId) return false;
      const pendentes = (Object.entries(rascunho) as [string, AcessoDeModulo][])
        .map(([chave, access]) => {
          const [papel, modulo] = chave.split(":") as [PapelDePermissao, ModuloDePermissao];
          return { chave, papel, modulo, access };
        })
        .filter((item) => item.access !== acessoGravado(item.papel, item.modulo));
      if (pendentes.length === 0) {
        setRascunho({});
        return true;
      }
      setSalvando(true);
      const resultados = await Promise.all(
        pendentes.map(async (item) => {
          const { error } = await supabase
            .from("organization_role_grants")
            .update({ access: item.access })
            .eq("organization_id", orgId)
            .eq("role", item.papel)
            .eq("module", item.modulo);
          return { ...item, error };
        }),
      );
      setSalvando(false);
      const falhas = resultados.filter((item) => item.error);
      setRascunho((atual) => {
        const proximo = { ...atual };
        for (const item of resultados) {
          if (!item.error) delete proximo[item.chave];
        }
        return proximo;
      });
      await queryClient.invalidateQueries({ queryKey: ["role-grants", orgId] });
      await refresh();
      if (falhas.length > 0) {
        toast.error(falhas[0].error?.message ?? "Não foi possível salvar as permissões");
        return false;
      }
      toast.success("Permissões atualizadas");
      return true;
    },
  }));

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
                    const editavel = editando && podeEditar(papel.key, modulo.key);
                    return (
                      <TableCell key={papel.key} className="text-center">
                        {editavel ? (
                          <Select
                            value={valor}
                            disabled={salvando || matriz.isLoading}
                            onValueChange={(v) =>
                              setRascunho((atual) => ({ ...atual, [chaveDe(papel.key, modulo.key)]: v as AcessoDeModulo }))
                            }
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
                        ) : (
                          <span className="text-sm">{ACESSO_DE_MODULO[valor]}</span>
                        )}
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
});
