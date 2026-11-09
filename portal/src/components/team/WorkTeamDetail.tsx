import { useState } from "react";
import { Archive, ArchiveRestore, ChevronsUpDown, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/DateInput";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConfirm } from "@/hooks/useConfirm";
import { useOrganization } from "@/hooks/useOrganization";
import {
  mensagemDeErroDeEquipe,
  useAlterarEquipe,
  useEquipesDeTrabalho,
  usePessoasDaOrganizacao,
  useProjetosDaOrganizacao,
  type OperacaoDeEquipe,
} from "@/hooks/useEquipesDeTrabalho";
import {
  ACESSO_AO_PROJETO,
  PAPEL_NA_EQUIPE,
  arvoreDeProjetos,
  dataDoInput,
  fimDoDia,
  vinculoVigente,
  type AcessoAoProjeto,
  type DadosDaEquipe,
  type PapelNaEquipe,
} from "@/lib/equipes";
import { WorkTeamFormDialog } from "./WorkTeamFormDialog";

type Opcao = { id: string; rotulo: string; nivel?: number };

/** Lista com busca dentro de um popover, para escolher pessoa ou projeto. */
function Escolher({
  rotulo,
  vazio,
  opcoes,
  onEscolher,
  disabled,
}: {
  rotulo: string;
  vazio: string;
  opcoes: Opcao[];
  onEscolher: (id: string) => void;
  disabled?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled} aria-expanded={aberto}>
          <Plus className="h-3.5 w-3.5 mr-1" /> {rotulo}
          <ChevronsUpDown className="h-3.5 w-3.5 ml-1 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <Command>
          <CommandInput placeholder="Buscar…" />
          <CommandList>
            <CommandEmpty>{vazio}</CommandEmpty>
            <CommandGroup>
              {opcoes.map((o) => (
                <CommandItem
                  key={o.id}
                  value={`${o.rotulo} ${o.id}`}
                  onSelect={() => {
                    setAberto(false);
                    onEscolher(o.id);
                  }}
                >
                  <span style={{ paddingLeft: `${(o.nivel ?? 0) * 12}px` }}>{o.rotulo}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Detalhe da equipe: membros e projetos. Só owner/admin alteram nesta tela. */
export function WorkTeamDetail({ equipeId, onClose }: { equipeId: string | null; onClose: () => void }) {
  const { orgId, isAdmin } = useOrganization();
  const confirm = useConfirm();
  const equipes = useEquipesDeTrabalho(orgId);
  const pessoas = usePessoasDaOrganizacao(orgId);
  const projetosDaOrg = useProjetosDaOrganizacao(orgId);
  const alterar = useAlterarEquipe(orgId);
  const [editando, setEditando] = useState(false);

  const equipe = equipes.data?.equipes.find((e) => e.id === equipeId) ?? null;

  const gravar = (op: OperacaoDeEquipe, sucesso?: string) =>
    alterar.mutate(op, {
      onSuccess: () => sucesso && toast.success(sucesso),
      onError: (erro) => toast.error("Não foi possível salvar", { description: mensagemDeErroDeEquipe(erro) }),
    });

  const salvarDados = async (dados: DadosDaEquipe) => {
    if (!equipe) return false;
    try {
      await alterar.mutateAsync({ tipo: "editar", id: equipe.id, name: dados.name, description: dados.description });
      toast.success("Equipe atualizada");
      return true;
    } catch (erro) {
      toast.error("Não foi possível salvar", { description: mensagemDeErroDeEquipe(erro) });
      return false;
    }
  };

  const arquivar = async () => {
    if (!equipe) return;
    const ok = await confirm({
      title: `Arquivar a equipe ${equipe.name}?`,
      description: "Os vínculos ficam guardados, mas a equipe deixa de valer e não recebe membros nem projetos.",
      confirmLabel: "Arquivar",
      destructive: true,
    });
    if (ok) gravar({ tipo: "arquivar", id: equipe.id }, "Equipe arquivada");
  };

  if (!equipe) {
    return <Dialog open={false} onOpenChange={() => onClose()} />;
  }

  const ativa = equipe.status === "ativo";
  const pode = isAdmin && ativa && !alterar.isPending;
  const nomes = new Map((pessoas.data ?? []).map((p) => [p.user_id, p]));
  const vinculos = (equipes.data?.membros ?? [])
    .filter((m) => m.team_id === equipe.id && m.status === "ativo")
    .sort((a, b) => (nomes.get(a.user_id)?.nome ?? "").localeCompare(nomes.get(b.user_id)?.nome ?? "", "pt-BR"));
  const naEquipe = new Set(vinculos.map((m) => m.user_id));
  const candidatos = (pessoas.data ?? [])
    .filter((p) => p.status === "ativo" && !naEquipe.has(p.user_id))
    .map((p) => ({ id: p.user_id, rotulo: p.nome }));

  const projetosDaOrgPorId = new Map((projetosDaOrg.data ?? []).map((p) => [p.id, p]));
  const vinculados = (equipes.data?.projetos ?? []).filter((p) => p.team_id === equipe.id);
  const jaVinculados = new Set(vinculados.map((p) => p.property_id));
  const arvore = arvoreDeProjetos(projetosDaOrg.data ?? []);
  const projetosLivres = arvore
    .filter((p) => !jaVinculados.has(p.id))
    .map((p) => ({ id: p.id, rotulo: p.name, nivel: p.nivel }));
  const ordemNaArvore = new Map(arvore.map((p, i) => [p.id, i]));
  const vinculadosEmOrdem = [...vinculados].sort(
    (a, b) => (ordemNaArvore.get(a.property_id) ?? 0) - (ordemNaArvore.get(b.property_id) ?? 0),
  );

  return (
    <>
      <Dialog open={!!equipeId && !editando} onOpenChange={(aberto) => !aberto && onClose()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {equipe.name}
              {!ativa && <Badge variant="outline">Arquivada</Badge>}
            </DialogTitle>
            <DialogDescription>{equipe.description || "Membros e projetos desta equipe."}</DialogDescription>
          </DialogHeader>

          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              {ativa ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => setEditando(true)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Editar dados
                  </Button>
                  <Button size="sm" variant="outline" onClick={arquivar} disabled={alterar.isPending}>
                    <Archive className="h-3.5 w-3.5 mr-1" /> Arquivar
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => gravar({ tipo: "restaurar", id: equipe.id }, "Equipe restaurada")}
                  disabled={alterar.isPending}
                >
                  <ArchiveRestore className="h-3.5 w-3.5 mr-1" /> Restaurar
                </Button>
              )}
            </div>
          )}

          <section className="space-y-2" aria-labelledby="equipe-membros">
            <div className="flex items-center justify-between gap-2">
              <h3 id="equipe-membros" className="text-sm font-semibold">
                Membros ({vinculos.length})
              </h3>
              {pode && (
                <Escolher
                  rotulo="Adicionar membro"
                  vazio="Todos os membros ativos já estão na equipe."
                  opcoes={candidatos}
                  onEscolher={(userId) =>
                    gravar(
                      { tipo: "incluir_membro", team_id: equipe.id, user_id: userId, team_role: "membro", expires_at: null },
                      "Membro adicionado",
                    )
                  }
                />
              )}
            </div>
            {vinculos.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3">Ninguém nesta equipe ainda.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Papel na equipe</TableHead>
                    <TableHead>Até</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vinculos.map((m) => {
                    const pessoa = nomes.get(m.user_id);
                    const nome = pessoa?.nome ?? "Sem nome";
                    const alterarMembro = (mudanca: { team_role?: PapelNaEquipe; expires_at?: string | null }) =>
                      gravar({
                        tipo: "alterar_membro",
                        team_id: equipe.id,
                        user_id: m.user_id,
                        team_role: mudanca.team_role ?? (m.team_role as PapelNaEquipe),
                        expires_at: mudanca.expires_at === undefined ? m.expires_at : mudanca.expires_at,
                      });
                    return (
                      <TableRow key={m.user_id}>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium">{nome}</span>
                            {!vinculoVigente(m) && <Badge variant="outline">Vencido</Badge>}
                            {pessoa && pessoa.status !== "ativo" && <Badge variant="destructive">Fora da organização</Badge>}
                          </div>
                        </TableCell>
                        <TableCell>
                          {pode ? (
                            <Select
                              value={m.team_role}
                              onValueChange={(v) => alterarMembro({ team_role: v as PapelNaEquipe })}
                            >
                              <SelectTrigger className="h-8 w-32" aria-label={`Papel de ${nome} na equipe`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(Object.keys(PAPEL_NA_EQUIPE) as PapelNaEquipe[]).map((p) => (
                                  <SelectItem key={p} value={p}>
                                    {PAPEL_NA_EQUIPE[p]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            PAPEL_NA_EQUIPE[m.team_role as PapelNaEquipe] ?? m.team_role
                          )}
                        </TableCell>
                        <TableCell>
                          {pode ? (
                            <DateInput
                              key={m.expires_at ?? "sem-data"}
                              className="h-8 w-40"
                              aria-label={`Data de fim de ${nome} na equipe`}
                              min={dataDoInput(new Date().toISOString())}
                              defaultValue={dataDoInput(m.expires_at)}
                              onCommit={(iso) => {
                                const valor = iso ? fimDoDia(iso) : null;
                                if (dataDoInput(valor) !== dataDoInput(m.expires_at)) {
                                  alterarMembro({ expires_at: valor });
                                }
                              }}
                            />
                          ) : m.expires_at ? (
                            new Date(m.expires_at).toLocaleDateString("pt-BR")
                          ) : (
                            "Sem data de fim"
                          )}
                        </TableCell>
                        <TableCell>
                          {pode && (
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Tirar ${nome} da equipe`}
                              title="Tirar da equipe"
                              onClick={() =>
                                gravar({ tipo: "tirar_membro", team_id: equipe.id, user_id: m.user_id }, "Membro removido da equipe")
                              }
                            >
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </section>

          <section className="space-y-2" aria-labelledby="equipe-projetos">
            <div className="flex items-center justify-between gap-2">
              <h3 id="equipe-projetos" className="text-sm font-semibold">
                Projetos ({vinculados.length})
              </h3>
              {pode && (
                <Escolher
                  rotulo="Adicionar projeto"
                  vazio="Nenhum projeto disponível."
                  opcoes={projetosLivres}
                  onEscolher={(propertyId) =>
                    gravar(
                      {
                        tipo: "vincular_projeto",
                        team_id: equipe.id,
                        property_id: propertyId,
                        access: "write",
                        include_children: true,
                      },
                      "Projeto vinculado",
                    )
                  }
                />
              )}
            </div>
            {vinculados.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3">Nenhum projeto vinculado.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Projeto</TableHead>
                    <TableHead>Acesso</TableHead>
                    <TableHead>Subprojetos</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vinculadosEmOrdem.map((p) => {
                    const projeto = projetosDaOrgPorId.get(p.property_id);
                    const nome = projeto?.name ?? "Projeto";
                    const mae = projeto?.parent_property_id ? projetosDaOrgPorId.get(projeto.parent_property_id) : null;
                    const alterarProjeto = (mudanca: { access?: AcessoAoProjeto; include_children?: boolean }) =>
                      gravar({
                        tipo: "alterar_projeto",
                        team_id: equipe.id,
                        property_id: p.property_id,
                        access: mudanca.access ?? (p.access as AcessoAoProjeto),
                        include_children: mudanca.include_children ?? p.include_children,
                      });
                    return (
                      <TableRow key={p.property_id}>
                        <TableCell>
                          <div className="font-medium">{nome}</div>
                          {mae && <div className="text-xs text-muted-foreground">em {mae.name}</div>}
                        </TableCell>
                        <TableCell>
                          {pode ? (
                            <Select value={p.access} onValueChange={(v) => alterarProjeto({ access: v as AcessoAoProjeto })}>
                              <SelectTrigger className="h-8 w-32" aria-label={`Acesso da equipe a ${nome}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(Object.keys(ACESSO_AO_PROJETO) as AcessoAoProjeto[]).map((a) => (
                                  <SelectItem key={a} value={a}>
                                    {ACESSO_AO_PROJETO[a]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            ACESSO_AO_PROJETO[p.access as AcessoAoProjeto] ?? p.access
                          )}
                        </TableCell>
                        <TableCell>
                          {pode ? (
                            <Switch
                              checked={p.include_children}
                              onCheckedChange={(v) => alterarProjeto({ include_children: v })}
                              aria-label={`Incluir subprojetos de ${nome}`}
                            />
                          ) : p.include_children ? (
                            "Incluídos"
                          ) : (
                            "Só o projeto"
                          )}
                        </TableCell>
                        <TableCell>
                          {pode && (
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Desvincular ${nome}`}
                              title="Desvincular"
                              onClick={() =>
                                gravar(
                                  { tipo: "desvincular_projeto", team_id: equipe.id, property_id: p.property_id },
                                  "Projeto desvinculado",
                                )
                              }
                            >
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </section>
        </DialogContent>
      </Dialog>

      <WorkTeamFormDialog
        open={editando}
        onOpenChange={setEditando}
        inicial={{ name: equipe.name, description: equipe.description ?? "" }}
        onSalvar={salvarDados}
      />
    </>
  );
}
