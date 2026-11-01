import { useState } from "react";
import { Eye, Info, Loader2, Network, Plus } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useOrganization } from "@/hooks/useOrganization";
import {
  mensagemDeErroDeEquipe,
  useAlterarEquipe,
  useEquipesDeTrabalho,
  usePessoasDaOrganizacao,
} from "@/hooks/useEquipesDeTrabalho";
import { vinculoVigente, type DadosDaEquipe } from "@/lib/equipes";
import { WorkTeamFormDialog } from "./WorkTeamFormDialog";
import { WorkTeamDetail } from "./WorkTeamDetail";
import { VerComoDialog } from "./VerComoDialog";

/** Aba "Equipes de trabalho" de Usuários & Permissões (fase 1 do plano de equipes). */
export function WorkTeams() {
  const { orgId, isAdmin } = useOrganization();
  const equipes = useEquipesDeTrabalho(orgId);
  const pessoas = usePessoasDaOrganizacao(orgId);
  const alterar = useAlterarEquipe(orgId);

  const [mostrarArquivadas, setMostrarArquivadas] = useState(false);
  const [criando, setCriando] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  const [verComo, setVerComo] = useState(false);

  const criar = async (dados: DadosDaEquipe) => {
    try {
      await alterar.mutateAsync({ tipo: "criar", name: dados.name, description: dados.description });
      toast.success("Equipe criada");
      return true;
    } catch (erro) {
      toast.error("Erro ao criar equipe", { description: mensagemDeErroDeEquipe(erro) });
      return false;
    }
  };

  if (equipes.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (equipes.isError) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Não foi possível carregar as equipes. Recarregue a página.
        </CardContent>
      </Card>
    );
  }

  const dados = equipes.data ?? { equipes: [], membros: [], projetos: [] };
  const nomes = new Map((pessoas.data ?? []).map((p) => [p.user_id, p.nome]));
  const temArquivadas = dados.equipes.some((e) => e.status !== "ativo");
  const visiveis = dados.equipes.filter((e) => mostrarArquivadas || e.status === "ativo");

  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Cada equipe recebe projetos, e quem está nela herda o acesso a eles. Por enquanto as equipes organizam o
          trabalho, mas ainda não limitam o que cada pessoa vê: todos os papéis continuam vendo a organização inteira.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Equipes de trabalho</CardTitle>
            <CardDescription>
              {dados.equipes.filter((e) => e.status === "ativo").length} equipe(s) ativa(s)
            </CardDescription>
          </div>
          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setVerComo(true)}>
                <Eye className="h-4 w-4 mr-2" /> Ver como
              </Button>
              <Button onClick={() => setCriando(true)}>
                <Plus className="h-4 w-4 mr-2" /> Nova equipe
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {temArquivadas && (
            <div className="flex items-center gap-2">
              <Switch id="mostrar-arquivadas" checked={mostrarArquivadas} onCheckedChange={setMostrarArquivadas} />
              <Label htmlFor="mostrar-arquivadas" className="font-normal">
                Mostrar arquivadas
              </Label>
            </div>
          )}

          {visiveis.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Network className="h-8 w-8 mx-auto mb-2 opacity-50" />
              Nenhuma equipe ainda.
              {isAdmin && " Crie uma equipe para separar quem trabalha em quais projetos."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Equipe</TableHead>
                  <TableHead>Líder</TableHead>
                  <TableHead className="text-right">Membros</TableHead>
                  <TableHead className="text-right">Projetos</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map((equipe) => {
                  const vigentes = dados.membros.filter((m) => m.team_id === equipe.id && vinculoVigente(m));
                  const lideres = vigentes
                    .filter((m) => m.team_role === "lider")
                    .map((m) => nomes.get(m.user_id) ?? "Sem nome");
                  const projetos = dados.projetos.filter((p) => p.team_id === equipe.id).length;
                  return (
                    <TableRow key={equipe.id}>
                      <TableCell>
                        <div className="flex items-center gap-2 font-medium">
                          {equipe.name}
                          {equipe.status !== "ativo" && <Badge variant="outline">Arquivada</Badge>}
                        </div>
                        {equipe.description && (
                          <div className="text-xs text-muted-foreground line-clamp-1">{equipe.description}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{lideres.length ? lideres.join(", ") : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{vigentes.length}</TableCell>
                      <TableCell className="text-right tabular-nums">{projetos}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setAberta(equipe.id)}
                          aria-label={`Abrir a equipe ${equipe.name}`}
                        >
                          Abrir
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <WorkTeamFormDialog open={criando} onOpenChange={setCriando} onSalvar={criar} />
      <WorkTeamDetail equipeId={aberta} onClose={() => setAberta(null)} />
      {isAdmin && <VerComoDialog open={verComo} onOpenChange={setVerComo} />}
    </div>
  );
}
