import { Fragment, useMemo, useState, type FormEvent } from "react";
import {
  Archive,
  ArchiveRestore,
  Film,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Image as ImageIcon,
  MoreHorizontal,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { useConfirm } from "@/hooks/useConfirm";
import { useFiltroSalvo } from "@/hooks/useFiltroSalvo";
import {
  mensagemDoErroDePasta,
  useArquivarMidia,
  useArquivarPasta,
  useCriarPasta,
  useDesarquivarPasta,
  useMidiasDaEdicao,
  useMoverMidia,
  useMoverPasta,
  usePastasDaEdicao,
  useRenomearPasta,
  type MidiaDaEdicaoRow,
  type PastaDaEdicaoRow,
} from "@/hooks/usePastasDaEdicao";
import {
  NOME_DA_PASTA_MAX,
  caminhoAte,
  conteudoParaArquivar,
  destinosDaMidia,
  destinosDaPasta,
  erroNoNomeDaPasta,
  filhasDe,
  maeArquivada,
  subarvore,
} from "@/lib/pastasDaEdicao";
import { formatarBytes } from "@/lib/armazenamento";

const RAIZ = "__raiz__";

const STATUS_DA_MIDIA: Record<string, string> = {
  aguardando_envio: "Aguardando envio",
  enviando: "Enviando",
  enviado: "Enviado",
  processando: "Processando",
  pronto: "Pronto",
  erro: "Erro",
};

type DialogoDeNome = { modo: "criar"; paiId: string | null } | { modo: "renomear"; pasta: PastaDaEdicaoRow };
type DialogoDeMover = { tipo: "pasta"; pasta: PastaDaEdicaoRow } | { tipo: "midia"; midia: MidiaDaEdicaoRow };

interface EditionMediaFoldersProps {
  propertyId: string;
  /** Nomes de Cliente › Projeto › Edição, já resolvidos pela página. */
  trilha: string[];
  /** Só experiência: quem decide é a RLS (padrão 7, crm ou operacional). */
  podeEditar: boolean;
}

/**
 * Pastas e arquivos do material da edição (BP-7.04, D12). A edição é a pasta
 * raiz; o usuário cria subpastas e pode deixar arquivos na raiz. Nada é
 * apagado: pasta e arquivo se arquivam.
 */
const EditionMediaFolders = ({ propertyId, trilha, podeEditar }: EditionMediaFoldersProps) => {
  const confirm = useConfirm();
  const pastasQuery = usePastasDaEdicao(propertyId);
  const midiasQuery = useMidiasDaEdicao(propertyId);
  const [mostrarArquivadas, setMostrarArquivadas] = useFiltroSalvo("midia-da-edicao", "arquivadas", false);
  const [pastaAtualId, setPastaAtualId] = useState<string | null>(null);
  const [dialogoDeNome, setDialogoDeNome] = useState<DialogoDeNome | null>(null);
  const [nome, setNome] = useState("");
  const [dialogoDeMover, setDialogoDeMover] = useState<DialogoDeMover | null>(null);
  const [destino, setDestino] = useState<string>("");

  const criar = useCriarPasta(propertyId);
  const renomear = useRenomearPasta(propertyId);
  const moverPasta = useMoverPasta(propertyId);
  const moverMidia = useMoverMidia(propertyId);
  const arquivarMidia = useArquivarMidia(propertyId);
  const arquivarPasta = useArquivarPasta(propertyId);
  const desarquivarPasta = useDesarquivarPasta(propertyId);

  const pastas = useMemo(() => pastasQuery.data ?? [], [pastasQuery.data]);
  const midias = useMemo(() => midiasQuery.data ?? [], [midiasQuery.data]);
  const visiveis = useMemo(
    () => (mostrarArquivadas ? pastas : pastas.filter((p) => !p.archived_at)),
    [pastas, mostrarArquivadas],
  );

  // Pasta aberta que saiu da lista (arquivada com o filtro desligado): volta à raiz.
  const pastaAtual = pastaAtualId ? visiveis.find((p) => p.id === pastaAtualId) ?? null : null;
  const caminho = caminhoAte(visiveis, pastaAtual?.id ?? null);
  const subpastas = filhasDe(visiveis, pastaAtual?.id ?? null);
  const arquivos = midias
    .filter((m) => m.folder_id === (pastaAtual?.id ?? null) && (mostrarArquivadas || !m.archived_at))
    .sort((a, b) => a.file_name.localeCompare(b.file_name, "pt-BR", { numeric: true }));

  const contarItens = (pastaId: string) => {
    const filhas = pastas.filter((p) => p.parent_folder_id === pastaId && !p.archived_at).length;
    const dentro = midias.filter((m) => m.folder_id === pastaId && !m.archived_at).length;
    return filhas + dentro;
  };

  const salvando = criar.isPending || renomear.isPending;
  const irmasDoDialogo =
    dialogoDeNome?.modo === "criar"
      ? pastas.filter((p) => p.parent_folder_id === dialogoDeNome.paiId)
      : dialogoDeNome?.modo === "renomear"
        ? pastas.filter((p) => p.parent_folder_id === dialogoDeNome.pasta.parent_folder_id)
        : [];
  const erroDeNome = dialogoDeNome
    ? erroNoNomeDaPasta(nome, irmasDoDialogo, dialogoDeNome.modo === "renomear" ? dialogoDeNome.pasta.id : undefined)
    : null;

  const abrirCriar = () => {
    setNome("");
    setDialogoDeNome({ modo: "criar", paiId: pastaAtual?.id ?? null });
  };
  const abrirRenomear = (pasta: PastaDaEdicaoRow) => {
    setNome(pasta.name);
    setDialogoDeNome({ modo: "renomear", pasta });
  };

  const salvarNome = async (e: FormEvent) => {
    e.preventDefault();
    if (!dialogoDeNome || erroDeNome) return;
    try {
      if (dialogoDeNome.modo === "criar") {
        await criar.mutateAsync({ name: nome, parentFolderId: dialogoDeNome.paiId });
        toast.success("Pasta criada");
      } else {
        await renomear.mutateAsync({ id: dialogoDeNome.pasta.id, name: nome });
        toast.success("Pasta renomeada");
      }
      setDialogoDeNome(null);
    } catch (erro) {
      toast.error(mensagemDoErroDePasta(erro));
    }
  };

  const destinosDoDialogo = !dialogoDeMover
    ? []
    : dialogoDeMover.tipo === "pasta"
      ? destinosDaPasta(pastas, dialogoDeMover.pasta.id)
      : destinosDaMidia(pastas, dialogoDeMover.midia.folder_id);

  const abrirMover = (alvo: DialogoDeMover) => {
    setDestino("");
    setDialogoDeMover(alvo);
  };

  const confirmarMover = async (e: FormEvent) => {
    e.preventDefault();
    if (!dialogoDeMover || !destino) return;
    const paraOnde = destino === RAIZ ? null : destino;
    try {
      if (dialogoDeMover.tipo === "pasta") {
        await moverPasta.mutateAsync({ id: dialogoDeMover.pasta.id, parentFolderId: paraOnde });
      } else {
        await moverMidia.mutateAsync({ id: dialogoDeMover.midia.id, folderId: paraOnde });
      }
      toast.success("Movido");
      setDialogoDeMover(null);
    } catch (erro) {
      toast.error(mensagemDoErroDePasta(erro));
    }
  };

  const arquivar = async (pasta: PastaDaEdicaoRow) => {
    const conteudo = conteudoParaArquivar(pastas, midias, pasta.id);
    const outrasPastas = conteudo.pastas.length - 1;
    const partes = [
      outrasPastas > 0 ? `${outrasPastas} subpasta${outrasPastas > 1 ? "s" : ""}` : null,
      conteudo.midias.length > 0 ? `${conteudo.midias.length} arquivo${conteudo.midias.length > 1 ? "s" : ""}` : null,
    ].filter(Boolean);
    const ok = await confirm({
      title: `Arquivar a pasta "${pasta.name}"?`,
      description:
        partes.length > 0
          ? `O conteúdo dela (${partes.join(" e ")}) também vai para o arquivo. Nada é apagado: dá para desarquivar depois.`
          : "Nada é apagado: dá para desarquivar depois.",
      confirmLabel: "Arquivar",
    });
    if (!ok) return;
    try {
      await arquivarPasta.mutateAsync({ id: pasta.id, pastas, midias });
      if (pastaAtual && subarvore(pastas, pasta.id).has(pastaAtual.id) && !mostrarArquivadas) {
        setPastaAtualId(pasta.parent_folder_id);
      }
      toast.success("Pasta arquivada");
    } catch (erro) {
      toast.error(mensagemDoErroDePasta(erro));
    }
  };

  const desarquivar = async (pasta: PastaDaEdicaoRow) => {
    if (maeArquivada(pastas, pasta.id)) {
      toast.error("Desarquive antes a pasta em que esta está.");
      return;
    }
    try {
      await desarquivarPasta.mutateAsync({ id: pasta.id, pastas, midias });
      toast.success("Pasta desarquivada, com o conteúdo dela");
    } catch (erro) {
      toast.error(mensagemDoErroDePasta(erro));
    }
  };

  const alternarArquivoDaMidia = async (midia: MidiaDaEdicaoRow) => {
    const arquivarAgora = !midia.archived_at;
    if (!arquivarAgora && midia.folder_id && pastas.find((p) => p.id === midia.folder_id)?.archived_at) {
      toast.error("Desarquive antes a pasta deste arquivo.");
      return;
    }
    try {
      await arquivarMidia.mutateAsync({ id: midia.id, arquivar: arquivarAgora });
      toast.success(arquivarAgora ? "Arquivo arquivado" : "Arquivo desarquivado");
    } catch (erro) {
      toast.error(mensagemDoErroDePasta(erro));
    }
  };

  if (pastasQuery.isLoading || midiasQuery.isLoading) return <LoadingSkeleton />;
  if (pastasQuery.isError || midiasQuery.isError) {
    return (
      <EmptyState
        icon={FolderOpen}
        title="Não foi possível carregar o material"
        description="Recarregue a página. Se continuar, avise o suporte."
      />
    );
  }

  const vazio = subpastas.length === 0 && arquivos.length === 0;

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-lg">Material da edição</CardTitle>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch id="mostrar-arquivadas" checked={mostrarArquivadas} onCheckedChange={setMostrarArquivadas} />
              <Label htmlFor="mostrar-arquivadas" className="text-sm font-normal">
                Mostrar arquivados
              </Label>
            </div>
            {podeEditar && (
              <Button size="sm" onClick={abrirCriar} disabled={!!pastaAtual?.archived_at}>
                <FolderPlus className="mr-1.5 h-4 w-4" /> Nova pasta
              </Button>
            )}
          </div>
        </div>
        <Breadcrumb aria-label="Pasta atual">
          <BreadcrumbList>
            {trilha.map((nomeDaTrilha, i) => (
              <Fragment key={`${nomeDaTrilha}-${i}`}>
                <BreadcrumbItem className="min-w-0">
                  <span className="truncate">{nomeDaTrilha}</span>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
              </Fragment>
            ))}
            <BreadcrumbItem>
              {caminho.length === 0 ? (
                <BreadcrumbPage>Material</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <button type="button" onClick={() => setPastaAtualId(null)}>
                    Material
                  </button>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {caminho.map((p, i) => (
              <Fragment key={p.id}>
                <BreadcrumbSeparator />
                <BreadcrumbItem className="min-w-0">
                  {i === caminho.length - 1 ? (
                    <BreadcrumbPage className="truncate">{p.name}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <button type="button" className="truncate" onClick={() => setPastaAtualId(p.id)}>
                        {p.name}
                      </button>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </CardHeader>
      <CardContent>
        {vazio ? (
          <EmptyState
            icon={FolderOpen}
            bordered={false}
            title={pastaAtual ? "Pasta vazia" : "Nenhuma pasta ainda"}
            description={
              podeEditar
                ? "Organize o material da edição em pastas: por jogo, dia, câmera, o que fizer sentido. Arquivos também podem ficar aqui, sem pasta."
                : "Ainda não há material nesta pasta."
            }
            action={
              podeEditar && !pastaAtual?.archived_at ? (
                <Button size="sm" onClick={abrirCriar}>
                  <FolderPlus className="mr-1.5 h-4 w-4" /> Nova pasta
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y rounded-md border">
            {subpastas.map((pasta) => {
              const itens = contarItens(pasta.id);
              return (
                <li key={pasta.id} className="flex items-center gap-3 px-3 py-2">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => setPastaAtualId(pasta.id)}
                  >
                    <Folder className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                    <span className="truncate font-medium">{pasta.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {itens === 0 ? "vazia" : `${itens} ${itens === 1 ? "item" : "itens"}`}
                    </span>
                    {pasta.archived_at && <Badge variant="secondary">Arquivada</Badge>}
                  </button>
                  {podeEditar && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Ações da pasta ${pasta.name}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {pasta.archived_at ? (
                          <DropdownMenuItem onSelect={() => desarquivar(pasta)}>
                            <ArchiveRestore className="mr-2 h-4 w-4" /> Desarquivar
                          </DropdownMenuItem>
                        ) : (
                          <>
                            <DropdownMenuItem onSelect={() => abrirRenomear(pasta)}>
                              <Pencil className="mr-2 h-4 w-4" /> Renomear
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => abrirMover({ tipo: "pasta", pasta })}>
                              <FolderInput className="mr-2 h-4 w-4" /> Mover
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => arquivar(pasta)}>
                              <Archive className="mr-2 h-4 w-4" /> Arquivar
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </li>
              );
            })}
            {arquivos.map((midia) => {
              const Icone = midia.kind === "video" ? Film : ImageIcon;
              return (
                <li key={midia.id} className="flex items-center gap-3 px-3 py-2">
                  <Icone className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{midia.file_name}</span>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                    {formatarBytes(midia.declared_size_bytes)}
                  </span>
                  <Badge variant="outline">{STATUS_DA_MIDIA[midia.status] ?? midia.status}</Badge>
                  {midia.archived_at && <Badge variant="secondary">Arquivado</Badge>}
                  {podeEditar && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Ações do arquivo ${midia.file_name}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {!midia.archived_at && (
                          <DropdownMenuItem onSelect={() => abrirMover({ tipo: "midia", midia })}>
                            <FolderInput className="mr-2 h-4 w-4" /> Mover
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onSelect={() => alternarArquivoDaMidia(midia)}>
                          {midia.archived_at ? (
                            <>
                              <ArchiveRestore className="mr-2 h-4 w-4" /> Desarquivar
                            </>
                          ) : (
                            <>
                              <Archive className="mr-2 h-4 w-4" /> Arquivar
                            </>
                          )}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <Dialog open={!!dialogoDeNome} onOpenChange={(aberto) => !aberto && setDialogoDeNome(null)}>
        <DialogContent>
          <form onSubmit={salvarNome} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{dialogoDeNome?.modo === "renomear" ? "Renomear pasta" : "Nova pasta"}</DialogTitle>
              <DialogDescription>
                {dialogoDeNome?.modo === "criar" && dialogoDeNome.paiId
                  ? `Dentro de "${pastas.find((p) => p.id === dialogoDeNome.paiId)?.name ?? ""}".`
                  : dialogoDeNome?.modo === "criar"
                    ? "Na raiz do material da edição."
                    : "O nome só muda na tela: os arquivos não saem do lugar."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="nome-da-pasta">Nome</Label>
              <Input
                id="nome-da-pasta"
                value={nome}
                maxLength={NOME_DA_PASTA_MAX}
                autoFocus
                aria-invalid={!!erroDeNome && nome.length > 0}
                aria-describedby="nome-da-pasta-erro"
                onChange={(e) => setNome(e.target.value)}
              />
              {erroDeNome && nome.length > 0 && (
                <p id="nome-da-pasta-erro" className="text-sm text-destructive">
                  {erroDeNome}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogoDeNome(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!!erroDeNome || salvando}>
                {dialogoDeNome?.modo === "renomear" ? "Salvar" : "Criar pasta"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!dialogoDeMover} onOpenChange={(aberto) => !aberto && setDialogoDeMover(null)}>
        <DialogContent>
          <form onSubmit={confirmarMover} className="space-y-4">
            <DialogHeader>
              <DialogTitle>
                Mover {dialogoDeMover?.tipo === "pasta" ? `"${dialogoDeMover.pasta.name}"` : dialogoDeMover ? `"${dialogoDeMover.midia.file_name}"` : ""}
              </DialogTitle>
              <DialogDescription>Mover só muda a organização na tela: o arquivo não é copiado de novo.</DialogDescription>
            </DialogHeader>
            {destinosDoDialogo.length === 0 ? (
              <p className="text-sm text-muted-foreground">Não há outra pasta para onde mover.</p>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="destino-da-pasta">Para</Label>
                <Select value={destino} onValueChange={setDestino}>
                  <SelectTrigger id="destino-da-pasta">
                    <SelectValue placeholder="Escolha a pasta" />
                  </SelectTrigger>
                  <SelectContent>
                    {destinosDoDialogo.map((d) =>
                      d === null ? (
                        <SelectItem key={RAIZ} value={RAIZ}>
                          Raiz do material
                        </SelectItem>
                      ) : (
                        <SelectItem key={d.id} value={d.id}>
                          <span style={{ paddingLeft: `${d.nivel * 12}px` }}>{d.name}</span>
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogoDeMover(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!destino || moverPasta.isPending || moverMidia.isPending}>
                Mover
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default EditionMediaFolders;
